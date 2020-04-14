package app

import (
	"bufio"
	"compress/gzip"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
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
	RootDomain = "covid-19.unko.in"

	DataRepoURL = "https://github.com/CSSEGISandData/COVID-19"

	GitPath            = "./data/git/COVID-19"
	RepoDataPath       = "./data/git/COVID-19/csse_covid_19_data/csse_covid_19_daily_reports"
	PublicPath         = "./www"
	ConvertDataPath    = "./www/data/daily_reports/json"
	SummaryDataPath    = "./www/data/daily_reports/summary.json"
	AccessLogPath      = "./log"
	NowJSONDefaultName = "2020-01-22.json"

	GitTimeoutDuration  = 1 * time.Minute
	UpdateCycleDuration = 1 * time.Hour
)

type Unixtime time.Time

func (ts *Unixtime) UnmarshalJSON(data []byte) error {
	i, err := strconv.ParseInt(string(data), 10, 64)
	t := time.Unix(i, 0)
	*ts = Unixtime(t)
	return err
}
func (ts Unixtime) MarshalJSON() ([]byte, error) {
	return strconv.AppendInt([]byte(nil), time.Time(ts).Unix(), 10), nil
}
func (ts *Unixtime) UnmarshalBinary(data []byte) error {
	t := time.Time(*ts)
	err := t.UnmarshalBinary(data)
	*ts = Unixtime(t)
	return err
}
func (ts Unixtime) MarshalBinary() ([]byte, error) {
	return time.Time(ts).MarshalBinary()
}

type TimeDaily time.Time

func (t TimeDaily) MarshalJSON() ([]byte, error) {
	return []byte(`"` + time.Time(t).Format("2006/01/02") + `"`), nil
}

type Dataset struct {
	Confirmed  uint64              `json:"confirmed"`
	Deaths     uint64              `json:"deaths"`
	Recovered  uint64              `json:"recovered"`
	LastUpdate *Unixtime           `json:"last_update,omitempty"`
	Latitude   float64             `json:"latitude,omitempty"`
	Longitude  float64             `json:"longitude,omitempty"`
	Children   map[string]*Dataset `json:"children,omitempty"`
}

type DatasetSimple struct {
	Date TimeDaily `json:"date"`
	CDR  [3]uint64 `json:"cdr"`
}
type CountrySummary struct {
	Daily []DatasetSimple `json:"daily"`
	CDR   [3]uint64       `json:"cdr"`
}
type WorldSummary struct {
	Countrys map[string]CountrySummary `json:"countrys"`
	CDR      [3]uint64                 `json:"cdr"`
}

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
var NoErrUpdate = fmt.Errorf("データ未更新")

func init() {
	//logger, err := zap.NewDevelopment()
	logger, err := zap.NewProduction()
	if err != nil {
		panic(err)
	}
	log = logger.Sugar()
	mime.AddExtensionType(".json", "application/json; charset=utf-8")
}

func New() *App {
	return &App{}
}

func (app *App) Run(ctx context.Context) error {
	if err := checkAndCreateDir(PublicPath); err != nil {
		return err
	}
	monich := make(chan ResultMonitor)
	rich := make(chan ResponseInfo, 32)
	jsondata := [3]*AliasHandler{&AliasHandler{}, &AliasHandler{}, &AliasHandler{}}
	jsondata[0].SetPath(filepath.Join(ConvertDataPath, NowJSONDefaultName))
	jsondata[1].SetPath(filepath.Join(ConvertDataPath, NowJSONDefaultName))
	jsondata[2].SetPath(filepath.Join(ConvertDataPath, NowJSONDefaultName))

	// 終了管理機能の起動
	ctx, exitch := app.startExitManageProc(ctx)

	// データ更新
	updateData(ctx, true)
	setJSONDataPath([]Alias{jsondata[0], jsondata[1], jsondata[2]})

	// サーバ起動
	app.wg.Add(1)
	go app.webServerMonitoringProc(ctx, rich, monich)
	app.wg.Add(1)
	go app.updateDataProc(ctx, []Alias{jsondata[0], jsondata[1], jsondata[2]})

	// URL設定
	http.Handle("/api/unko.in/1/monitor", &GetMonitoringHandler{ch: monich})
	http.Handle("/data/daily_reports/today.json", jsondata[0])
	http.Handle("/data/daily_reports/-1day.json", jsondata[1])
	http.Handle("/data/daily_reports/-2day.json", jsondata[2])
	http.Handle("/", http.FileServer(http.Dir(PublicPath)))

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
func (app *App) webServerMonitoringProc(ctx context.Context, rich <-chan ResponseInfo, monich chan<- ResultMonitor) {
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
			log.Infow("webServerMonitoringProc終了")
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

func (app *App) updateDataProc(ctx context.Context, jsondata []Alias) {
	defer app.wg.Done()
	tc := time.NewTicker(UpdateCycleDuration)
	defer tc.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Infow("updateDataProc終了")
			return
		case <-tc.C:
			updateData(ctx, false)
			setJSONDataPath(jsondata)
		}
	}
}

func setJSONDataPath(jsondata []Alias) {
	list, err := filepath.Glob(filepath.Join(ConvertDataPath, "*.json"))
	if err != nil {
		return
	}
	l := len(list)
	sort.Strings(list)
	for i := range jsondata {
		if l <= i {
			return
		}
		jsondata[i].SetPath(list[l-(i+1)])
	}
}

func updateData(ctx context.Context, update bool) {
	tctx, cancel := context.WithTimeout(ctx, GitTimeoutDuration)
	defer cancel()
	err := updateGitData(tctx)
	if !update {
		if err == NoErrUpdate {
			log.Infow("データ更新無し")
			return
		}
		if err != nil {
			log.Warnw("データのupdateに失敗", "error", err)
			return
		}
	}
	// データファイル更新
	updateDataFile()
	log.Infow("updateDataFile完了")
}

func updateGitData(ctx context.Context) error {
	clone, err := checkGit(ctx)
	if err != nil {
		return err
	} else if clone {
		return nil
	}
	err = updateGit(ctx, GitPath)
	if err == git.NoErrAlreadyUpToDate {
		return NoErrUpdate
	} else if err != nil {
		return err
	}
	return nil
}

func checkGit(ctx context.Context) (bool, error) {
	_, err := os.Stat(GitPath)
	if err != nil {
		err = cloneGit(ctx, GitPath, DataRepoURL)
		if err != nil {
			log.Warnw("gitリポジトリのcloneに失敗", "error", err)
		} else {
			log.Infow("gitリポジトリをcloneしました", "path", DataRepoURL)
			return true, nil
		}
	}
	return false, err
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
	dl, err := ioutil.ReadDir(RepoDataPath)
	if err != nil {
		return err
	}
	ws := &WorldSummary{
		Countrys: make(map[string]CountrySummary),
	}
	for _, it := range dl {
		if it.IsDir() {
			continue
		}
		name := it.Name()
		ext := filepath.Ext(name)
		if ext != ".csv" {
			continue
		}
		t, err := time.Parse("01-02-2006", strings.TrimRight(name, ext))
		if err != nil {
			continue
		}
		cmap, err := convertJSON(t, name)
		if err != nil {
			continue
		}
		// ファイル名の並び的には2021年になるとぶっ壊れるけどそのころにはコロナも落ち着いている事を期待
		appendSummary(ws, cmap, t)
	}
	for _, it := range ws.Countrys {
		ws.CDR[0] += it.CDR[0]
		ws.CDR[1] += it.CDR[1]
		ws.CDR[2] += it.CDR[2]
	}
	return storeSummary(ws)
}

func convertJSON(t time.Time, name string) (map[string]*Dataset, error) {
	cmap, err := csvToCountryMap(filepath.Join(RepoDataPath, name))
	if err != nil {
		return nil, err
	}
	p := filepath.Join(ConvertDataPath, t.Format("2006-01-02")+".json")
	fp, err := os.Create(p)
	if err != nil {
		log.Warnw("ファイル生成に失敗", "path", p, "error", err)
		return nil, err
	}
	defer fp.Close()
	w := bufio.NewWriterSize(fp, 128*1024)
	enc := json.NewEncoder(w)
	//enc.SetIndent("", "\t")
	err = enc.Encode(cmap)
	if err != nil {
		log.Warnw("JSON変換に失敗", "error", err)
		return nil, err
	}
	w.Flush()
	return cmap, nil
}

func appendSummary(ws *WorldSummary, cmap map[string]*Dataset, t time.Time) *WorldSummary {
	for countryname, country := range cmap {
		cs, ok := ws.Countrys[countryname]
		if !ok {
			cs = CountrySummary{
				Daily: make([]DatasetSimple, 0, 365),
			}
		}
		cs.Daily = append(cs.Daily, DatasetSimple{
			Date: TimeDaily(t),
			CDR:  [3]uint64{country.Confirmed, country.Deaths, country.Recovered},
		})
		cs.CDR = [3]uint64{country.Confirmed, country.Deaths, country.Recovered}
		ws.Countrys[countryname] = cs
	}
	return ws
}

func storeSummary(ws *WorldSummary) error {
	fp, err := os.Create(SummaryDataPath)
	if err != nil {
		return err
	}
	defer fp.Close()
	w := bufio.NewWriterSize(fp, 128*1024)
	enc := json.NewEncoder(w)
	//enc.SetIndent("", "\t")
	err = enc.Encode(ws)
	if err != nil {
		return err
	}
	return w.Flush()
}

func csvToCountryMap(p string) (map[string]*Dataset, error) {
	fp, err := os.Open(p)
	if err != nil {
		return nil, err
	}
	defer fp.Close()

	var hmax int
	indexmap := make(map[string]int, 9)
	cmap := make(map[string]*Dataset, 256)

	r := csv.NewReader(fp)
	// フィールドの数を可変にする
	r.FieldsPerRecord = -1
	if cells, err := r.Read(); err == nil {
		// ヘッダー
		hmax = len(cells)
		for i, cell := range cells {
			indexmap[headerToSubject(cell)] = i
		}
	}
	_, ok := indexmap["Country"]
	if !ok {
		// 国が無い
		return nil, fmt.Errorf("国情報が無いよ")
	}
	for cells, err := r.Read(); err == nil; cells, err = r.Read() {
		// データ
		if len(cells) != hmax {
			// csv.Reader使ってるから不要？
			continue
		}
		countrystr := strings.TrimSpace(cells[indexmap["Country"]])
		country, ok := cmap[countrystr]
		if !ok {
			country = &Dataset{}
		}
		var provincestr string
		var admin2str string
		if index, ok := indexmap["Province"]; ok {
			provincestr = strings.TrimSpace(cells[index])
			if ad, ok := indexmap["Admin2"]; ok {
				admin2str = cells[ad]
			}
		}
		ds := &Dataset{}
		if index, ok := indexmap["LastUpdate"]; ok {
			// 日付フォーマットが複数存在する問題
			var t time.Time
			lu := cells[index]
			if strings.Contains(lu, "/") {
				t, err = time.Parse("1/2/2006 15:04", lu)
				if err != nil {
					t, _ = time.Parse("1/2/06 15:04", lu)
				}
			} else if strings.Contains(lu, "T") {
				t, _ = time.Parse("2006-01-02T15:04:05", lu)
			} else {
				t, _ = time.Parse("2006-01-02 15:04:05", lu)
			}
			ds.LastUpdate = &Unixtime{}
			*(ds.LastUpdate) = Unixtime(t)
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
		if provincestr != "" {
			// 州が有る
			var province *Dataset
			var ok bool
			if country.Children != nil {
				if province, ok = country.Children[provincestr]; !ok {
					province = &Dataset{}
				}
			} else {
				country.Children = make(map[string]*Dataset)
				province = &Dataset{}
			}
			if admin2str != "" {
				// 群がある
				if province.Children == nil {
					province.Children = make(map[string]*Dataset)
				}
				province.Children[admin2str] = ds
				province.Confirmed += ds.Confirmed
				province.Deaths += ds.Deaths
				province.Recovered += ds.Recovered

				country.Children[provincestr] = province
				country.Confirmed += ds.Confirmed
				country.Deaths += ds.Deaths
				country.Recovered += ds.Recovered
			} else {
				country.Children[provincestr] = ds
				country.Confirmed += ds.Confirmed
				country.Deaths += ds.Deaths
				country.Recovered += ds.Recovered
			}
		} else {
			// 州が無い
			country = ds
		}
		cmap[countrystr] = country
	}
	return cmap, nil
}

func headerToSubject(cell string) string {
	var str string
	switch cell {
	case "Country/Region", "Country_Region":
		str = "Country"
	case "Province/State", "Province_State":
		str = "Province"
	case "Admin2":
		str = "Admin2"
	case "Last Update", "Last_Update":
		str = "LastUpdate"
	case "Confirmed":
		str = "Confirmed"
	case "Deaths":
		str = "Deaths"
	case "Recovered":
		str = "Recovered"
	case "Latitude", "Lat":
		str = "Latitude"
	case "Longitude", "Long_":
		str = "Longitude"
	}
	return str
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
