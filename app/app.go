package app

import (
	"bufio"
	"compress/gzip"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/NYTimes/gziphandler"
	"github.com/go-git/go-git"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"golang.org/x/crypto/acme/autocert"
	"gopkg.in/natefinch/lumberjack.v2"
)

const (
	RootDomain      = "covid-19.unko.in"
	DataRepoURL     = "https://github.com/CSSEGISandData/COVID-19"
	GitPath         = "./data/git/COVID-19"
	RepoDataDir     = "csse_covid_19_data/csse_covid_19_daily_reports"
	ConvertDataPath = "./www/data/covid_19_daily_reports_json"
	AccessLogPath   = "./log"
)

type Srv struct {
	s *http.Server
	f func(s *http.Server) error
}

type App struct {
	wg sync.WaitGroup
}

var gzipContentTypeList = []string{
	"text/html",
	"text/css",
	"text/javascript",
	"text/plain",
	"application/json",
}
var log *zap.SugaredLogger

func init() {
	//logger, err := zap.NewDevelopment()
	logger, err := zap.NewProduction()
	if err != nil {
		panic(err)
	}
	log = logger.Sugar()
}

func New() *App {
	return &App{}
}

func (app *App) Run(ctx context.Context) error {
	monich := make(chan ResultMonitor)
	rich := make(chan ResponseInfo, 32)
	ctx, exitch := app.startExitManageProc(ctx)

	// サーバ起動
	app.wg.Add(1)
	go app.serverMonitoringProc(ctx, rich, monich)
	app.wg.Add(1)
	go app.updateDataProc(ctx)

	// URL設定
	http.Handle("/api/unko.in/1/monitor", &GetMonitoringHandler{ch: monich})
	http.Handle("/", http.FileServer(http.Dir("./public_html")))

	ghfunc, err := gziphandler.GzipHandlerWithOpts(gziphandler.CompressionLevel(gzip.BestSpeed), gziphandler.ContentTypes(gzipContentTypeList))
	if err != nil {
		exitch <- struct{}{}
		log.Infow("サーバーハンドラの作成に失敗しました。", "error", err)
		return app.shutdown(ctx)
	}
	h := MonitoringHandler(ghfunc(http.DefaultServeMux), rich)

	// サーバ情報
	sl := []Srv{
		Srv{
			s: &http.Server{Addr: ":8080", Handler: h},
			f: func(s *http.Server) error { return s.ListenAndServe() },
		},
		Srv{
			s: &http.Server{Handler: h},
			f: func(s *http.Server) error { return s.Serve(autocert.NewListener(RootDomain)) },
		},
	}
	for _, s := range sl {
		s := s // ローカル化
		app.wg.Add(1)
		go s.startServer(&app.wg)
	}
	// シャットダウン管理
	return app.shutdown(ctx, sl...)
}

func (srv Srv) startServer(wg *sync.WaitGroup) {
	defer wg.Done()
	log.Infow("Srv.startServer", "Addr", srv.s.Addr)
	// サーバ起動
	err := srv.f(srv.s)
	// サーバが終了した場合
	if err != nil {
		if err == http.ErrServerClosed {
			log.Infow("サーバーがシャットダウンしました。", "error", err, "Addr", srv.s.Addr)
		} else {
			log.Warnw("サーバーが落ちました。", "error", err)
		}
	}
}

func (app *App) shutdown(ctx context.Context, sl ...Srv) error {
	// シグナル等でサーバを中断する
	<-ctx.Done()
	// シャットダウン処理用コンテキストの用意
	sctx, scancel := context.WithCancel(context.Background())
	defer scancel()
	for _, srv := range sl {
		app.wg.Add(1)
		go func(ctx context.Context, srv *http.Server) {
			sctx, sscancel := context.WithTimeout(ctx, time.Second*10)
			defer func() {
				sscancel()
				app.wg.Done()
			}()
			err := srv.Shutdown(sctx)
			if err != nil {
				log.Warnw("サーバーの終了に失敗しました。", "error", err)
			} else {
				log.Infow("サーバーの終了に成功しました。", "Addr", srv.Addr)
			}
		}(sctx, srv.s)
	}
	// サーバーの終了待機
	app.wg.Wait()
	return log.Sync()
}

func (app *App) startExitManageProc(ctx context.Context) (context.Context, chan<- struct{}) {
	exitch := make(chan struct{}, 1)
	ectx, cancel := context.WithCancel(ctx)
	app.wg.Add(1)
	go func(ctx context.Context, ch <-chan struct{}) {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig,
			syscall.SIGHUP,
			syscall.SIGINT,
			syscall.SIGTERM,
			syscall.SIGQUIT,
			os.Interrupt,
			os.Kill,
		)
		defer func() {
			signal.Stop(sig)
			cancel()
			app.wg.Done()
		}()

		select {
		case <-ctx.Done():
			log.Infow("Cancel from parent")
		case s := <-sig:
			log.Infow("Signal!!", "signal", s)
		case <-ch:
			log.Infow("Exit command!!")
		}
	}(ectx, exitch)
	return ectx, exitch
}

// サーバお手軽監視用
func (app *App) serverMonitoringProc(ctx context.Context, rich <-chan ResponseInfo, monich chan<- ResultMonitor) {
	defer app.wg.Done()
	// logrotateの設定がめんどくせーのでアプリでやる
	// https://github.com/uber-go/zap/blob/master/FAQ.md
	logger := zap.New(zapcore.NewCore(
		zapcore.NewJSONEncoder(zap.NewProductionEncoderConfig()),
		zapcore.AddSync(&lumberjack.Logger{
			Filename:   filepath.Join(AccessLogPath, "access.log"),
			MaxSize:    100, // megabytes
			MaxBackups: 100,
			MaxAge:     7,    // days
			Compress:   true, // disabled by default
		}),
		zap.InfoLevel,
	))
	defer logger.Sync()
	res := ResultMonitor{}
	resmin := ResultMonitor{}
	tc := time.NewTicker(time.Minute)
	defer tc.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Infow("serverMonitoringProc終了")
			return
		case monich <- resmin:
		case ri := <-rich:
			ela := ri.end.Sub(ri.start)
			res.ResponseCount++
			res.ResponseTimeSum += ela
			if ri.status < 400 {
				res.ResponseCodeOkCount++
			} else {
				res.ResponseCodeNgCount++
			}
			// アクセスログ出力
			logger.Info("-",
				zap.String("addr", ri.addr),
				zap.String("host", ri.host),
				zap.String("method", ri.method),
				zap.String("uri", ri.uri),
				zap.String("protocol", ri.protocol),
				zap.Int("status", ri.status),
				zap.Int("size", ri.size),
				zap.String("ua", ri.userAgent),
				zap.Duration("elapse", ela),
			)
		case <-tc.C:
			resmin = res
			res = ResultMonitor{}
		}
	}
}

func (app *App) updateDataProc(ctx context.Context) {
	defer app.wg.Done()
	f := func(ctx context.Context) {
		tctx, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		err := updateGitData(tctx)
		if err != nil {
			log.Warnw("データのupdateに失敗", "error", err)
			return
		}
		updateDataFile()
	}
	f(ctx)
	tc := time.NewTicker(1 * time.Hour)
	defer tc.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Infow("updateDataProc終了")
			return
		case <-tc.C:
			f(ctx)
		}
	}
}

func updateGitData(ctx context.Context) error {
	err := checkGit(ctx)
	if err != nil {
		return err
	}
	err = updateGit(ctx, GitPath)
	if err != nil && err != git.NoErrAlreadyUpToDate {
		return err
	}
	return nil
}

func checkGit(ctx context.Context) error {
	_, err := os.Stat(GitPath)
	if err != nil {
		err = cloneGit(ctx, GitPath, DataRepoURL)
		if err != nil {
			log.Warnw("gitリポジトリのcloneに失敗", "error", err)
		} else {
			log.Infow("gitリポジトリをcloneしました", "path", DataRepoURL)
		}
	}
	return err
}

func cloneGit(ctx context.Context, p, url string) error {
	if err := checkAndCreateDir(p); err != nil {
		return err
	}
	r, err := git.PlainCloneContext(ctx, p, false, &git.CloneOptions{
		URL: url,
	})
	if err != nil {
		return err
	}
	_, err = r.Head()
	if err != nil {
		return err
	}
	return nil
}

func updateGit(ctx context.Context, p string) error {
	r, err := git.PlainOpen(p)
	if err != nil {
		return err
	}
	w, err := r.Worktree()
	if err != nil {
		return err
	}
	err = w.PullContext(ctx, &git.PullOptions{RemoteName: "origin"})
	if err != nil {
		return err
	}
	_, err = r.Head()
	if err != nil {
		return err
	}
	return nil
}

func updateDataFile() error {
	if err := checkAndCreateDir(ConvertDataPath); err != nil {
		return err
	}
	dir := filepath.Join(GitPath, RepoDataDir)
	dl, err := ioutil.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, it := range dl {
		if it.IsDir() {
			continue
		}
		name := it.Name()
		if filepath.Ext(name) != ".csv" {
			continue
		}
		p := filepath.Join(dir, name)
		cmap, err := csvToCountryMap(p)
		if err != nil {
			continue
		}
		func() {
			p := filepath.Join(ConvertDataPath, name+".json")
			fp, err := os.Create(p)
			if err != nil {
				log.Infow("ファイル生成に失敗", "path", p, "error", err)
				return
			}
			defer fp.Close()
			w := bufio.NewWriter(fp)
			enc := json.NewEncoder(w)
			enc.SetIndent("", "\t")
			err = enc.Encode(cmap)
			if err != nil {
				log.Infow("JSON変換に失敗", "error", err)
				return
			}
			w.Flush()
		}()
	}
	return nil
}

type Dataset struct {
	LastUpdate time.Time `json:"last_update"`
	Confirmed  uint64    `json:"confirmed"`
	Deaths     uint64    `json:"deaths"`
	Recovered  uint64    `json:"recovered"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
}
type Country struct {
	Province  map[string]Dataset `json:"province"`
	Confirmed uint64             `json:"confirmed"`
	Deaths    uint64             `json:"deaths"`
	Recovered uint64             `json:"recovered"`
}

func csvToCountryMap(p string) (map[string]Country, error) {
	fp, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer fp.Close()

	var (
		countrystr  string
		countryold  string
		provincestr string
		hmax        int
	)
	indexmap := make(map[string]int, 9)
	cmap := make(map[string]Country, 256)

	r := csv.NewReader(fp)
	// フィールドの数を可変にする
	r.FieldsPerRecord = -1
	if cells, err := r.Read(); err == nil {
		// ヘッダー
		hmax = len(cells)
		for i, cell := range cells {
			switch cell {
			case "Country/Region", "Country_Region":
				indexmap["Country"] = i
			case "Province/State", "Province_State":
				indexmap["Province"] = i
			case "Admin2":
				indexmap["Admin2"] = i
			case "Last Update", "Last_Update":
				indexmap["LastUpdate"] = i
			case "Confirmed":
				indexmap["Confirmed"] = i
			case "Deaths":
				indexmap["Deaths"] = i
			case "Recovered":
				indexmap["Recovered"] = i
			case "Latitude", "Lat":
				indexmap["Latitude"] = i
			case "Longitude", "Long_":
				indexmap["Longitude"] = i
			}
		}
	}
	for cells, err := r.Read(); err == nil; cells, err = r.Read() {
		// データ
		if len(cells) != hmax {
			// csv.Reader使ってるから不要？
			continue
		}
		cindex, ok := indexmap["Country"]
		if !ok {
			// 国
			continue
		}
		countrystr = cells[cindex]
		if countrystr == "" {
			countrystr = countryold
		}
		countryold = countrystr
		country, ok := cmap[countrystr]
		if !ok {
			country = Country{}
			country.Province = make(map[string]Dataset)
		}
		if index, ok := indexmap["Province"]; ok {
			provincestr = cells[index]
			if ad, ok := indexmap["Admin2"]; ok {
				if provincestr != "" && cells[ad] != "" {
					provincestr = provincestr + "/" + cells[ad]
				}
			}
			if provincestr == "" {
				provincestr = "-"
			}
		} else {
			provincestr = "-"
		}
		ds := Dataset{}
		if index, ok := indexmap["LastUpdate"]; ok {
			// 日付フォーマットが複数存在する問題
			if strings.Contains(cells[index], "/") {
				ds.LastUpdate, err = time.Parse("1/2/2006 15:04", cells[index])
				if err != nil {
					ds.LastUpdate, _ = time.Parse("1/2/06 15:04", cells[index])
				}
			} else if strings.Contains(cells[index], "T") {
				ds.LastUpdate, _ = time.Parse("2006-01-02T15:04:05", cells[index])
			} else {
				ds.LastUpdate, _ = time.Parse("2006-01-02 15:04:05", cells[index])
			}
		}
		if index, ok := indexmap["Confirmed"]; ok {
			ds.Confirmed, _ = strconv.ParseUint(cells[index], 10, 64)
		}
		if index, ok := indexmap["Deaths"]; ok {
			ds.Deaths, _ = strconv.ParseUint(cells[index], 10, 64)
		}
		if index, ok := indexmap["Recovered"]; ok {
			ds.Recovered, _ = strconv.ParseUint(cells[index], 10, 64)
		}
		if index, ok := indexmap["Latitude"]; ok {
			ds.Latitude, _ = strconv.ParseFloat(cells[index], 64)
		}
		if index, ok := indexmap["Longitude"]; ok {
			ds.Longitude, _ = strconv.ParseFloat(cells[index], 64)
		}
		country.Province[provincestr] = ds
		country.Confirmed += ds.Confirmed
		country.Deaths += ds.Deaths
		country.Recovered += ds.Recovered
		cmap[countrystr] = country
	}
	return cmap, nil
}

func checkAndCreateDir(p string) error {
	st, err := os.Stat(p)
	if err != nil {
		return os.MkdirAll(p, 0666)
	}
	if st.IsDir() == false {
		return fmt.Errorf("フォルダを期待したけどファイルでした。:%s", p)
	}
	return nil
}
