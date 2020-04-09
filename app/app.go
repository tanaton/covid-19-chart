package app

import (
	"encoding/csv"

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
	DataPath        = "./data"
	RepoName        = "COVID-19"
	RepoDataDir     = "csse_covid_19_data/csse_covid_19_daily_reports"
	ConvertDataPath = "./data/daily_reports"
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
	go app.serverMonitoringProc(ctx, rich)
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
	tc := time.NewTicker(30 * time.Minute)
	defer tc.Stop()
	for {
		select {
		case <-tc.C:
			err := updateData()
			if err != nil {
				log.Warnw("データのupdateに失敗", "error", err)
				break
			}

		}
	}
}

func updateData() error {
	p := filepath.Join(DataPath, RepoName)
	_, err := os.Stat(p)
	if err != nil {
		err = cloneGit()
		if err != nil {
			log.Warnw("gitリポジトリのcloneに失敗", "error", err)
		} else {
			log.Infow("gitリポジトリをcloneしました", "path", DataRepoURL)
		}
	} else {
		err = updateGit(p)
	}
	return err
}

func cloneGit() error {
	r, err := git.PlainClone(DataPath, false, &git.CloneOptions{
		URL: DataRepoURL,
	})
	if err != nil {
		return err
	}
	_, err := r.Head()
	if err != nil {
		return err
	}
	return nil
}

func updateGit(p string) error {
	r, err := git.PlainOpen(p)
	if err != nil {
		return err
	}
	w, err := r.Worktree()
	if err != nil {
		return err
	}
	err = w.Pull(&git.PullOptions{RemoteName: "origin"})
	if err != nil {
		return err
	}
	ref, err := r.Head()
	if err != nil {
		return err
	}
	return nil
}

func updateMemory() error {
	dir := filepath.Join(DataPath, RepoName, RepoDataDir)
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
	}
}

type Dataset1 struct {
	Province_State string    // Province/State
	Country_Region string    // Country/Region
	Last_Update    time.Time // Last Update
	Confirmed      uint64    // Confirmed
	Deaths         uint64    // Deaths
	Recovered      uint64    // Recovered
}

type Dataset2 struct {
	Province_State string    // Province/State
	Country_Region string    // Country/Region
	Last_Update    time.Time // Last Update
	Confirmed      uint64    // Confirmed
	Deaths         uint64    // Deaths
	Recovered      uint64    // Recovered
	Latitude       float64   // Latitude
	Longitude      float64   // Longitude
}

type Dataset3 struct {
	FIPS           uint64
	Admin2         string
	Province_State string
	Country_Region string
	Last_Update    time.Time
	Lat            float64
	Long_          float64
	Confirmed      uint64
	Deaths         uint64
	Recovered      uint64
	Active         uint64
	Combined_Key   string
}

type Dataset struct {
	LastUpdate time.Time
	Confirmed  uint64
	Deaths     uint64
	Recovered  uint64
	Latitude   float64
	Longitude  float64
}
type ProvinceState map[string]Dataset
type CountryRegion map[string]ProvinceState

func csvToJson(p string) error {
	fp, err := os.Open(p)
	if err != nil {
		return err
	}
	defer fp.Close()

	var countryold string
	var hmax int
	index := [8]int{-1, -1, -1, -1, -1, -1, -1, -1}
	country := make(CountryRegion, 256)

	r := csv.NewReader(fp)
	// フィールドの数を可変にする
	r.FieldsPerRecord = -1
	if cells, err := r.Read(); err == nil {
		// ヘッダー
		hmax = len(cells)
		for i, cell := range cells {
			switch cell {
			case "Country/Region", "Country_Region":
				index[0] = i
			case "Province/State", "Province_State":
				index[1] = i
			case "Last Update", "Last_Update":
				index[2] = i
			case "Confirmed":
				index[3] = i
			case "Deaths":
				index[4] = i
			case "Recovered":
				index[5] = i
			case "Latitude", "Lat":
				index[6] = i
			case "Longitude", "Long_":
				index[7] = i
			}
		}
	}
	for cells, err := r.Read(); err == nil; cells, err = r.Read() {
		// データ
		l := len(cells)
		if l != hmax {
			continue
		}
		if index[0] < 0 {
			// 国
			continue
		}
		countrystr = cells[index[0]]
		if countrystr == "" {
			countrystr = countryold
		}
		countryold = countrystr
		province, ok := country[countrystr]
		if !ok {
			province = make(ProvinceState, 1)
		}
		if index[1] >= 0 {
			provincestr := cells[index[1]]
			if provincestr == "" {
				provincestr = "-"
			}
		} else {
			provincestr = "-"
		}
		ds := Dataset{}
		if index[2] >= 0 {
			// last update
			// ds.LastUpdate
		}
		if index[3] >= 0 {
			ds.Confirmed, err = strconv.ParseUint(cells[index[3]], 10, 64)
		}
		if index[4] >= 0 {
			ds.Deaths, err = strconv.ParseUint(cells[index[4]], 10, 64)
		}
		if index[5] >= 0 {
			ds.Recovered, err = strconv.ParseUint(cells[index[5]], 10, 64)
		}
		if index[6] >= 0 {
			ds.Latitude, err = strconv.ParseFloat(cells[index[6]], 64)
		}
		if index[7] >= 0 {
			ds.Longitude, err = strconv.ParseFloat(cells[index[7]], 64)
		}
		province[provincestr] = ds
		country[countrystr] = province
	}
}
