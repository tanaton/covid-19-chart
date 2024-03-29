package app

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"time"
)

type responseInfo struct {
	uri       string
	userAgent string
	status    int
	size      int
	start     time.Time
	end       time.Time
	method    string
	host      string
	protocol  string
	addr      string
}
type resultMonitor struct {
	ResponseTimeSum     time.Duration
	ResponseCount       uint
	ResponseCodeOkCount uint
	ResponseCodeNgCount uint
}
type MonitoringResponseWriter struct {
	http.ResponseWriter
	ri   responseInfo
	rich chan<- responseInfo
}

// MonitoringHandler モニタリング用ハンドラ生成
func MonitoringHandler(h http.Handler, rich chan<- responseInfo) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mrw := newMonitoringResponseWriter(w, r, rich)
		defer mrw.Close()
		h.ServeHTTP(mrw, r)
	})
}

func newMonitoringResponseWriter(w http.ResponseWriter, r *http.Request, rich chan<- responseInfo) *MonitoringResponseWriter {
	return &MonitoringResponseWriter{
		ResponseWriter: w,
		ri: responseInfo{
			uri:       r.RequestURI,
			userAgent: r.UserAgent(),
			start:     time.Now().UTC(),
			method:    r.Method,
			protocol:  r.Proto,
			host:      r.Host,
			addr:      r.RemoteAddr,
		},
		rich: rich,
	}
}

// Write メソッドをオーバーライド
func (mrw *MonitoringResponseWriter) Write(buf []byte) (int, error) {
	if mrw.ri.status == 0 {
		mrw.ri.status = http.StatusOK
	}
	s, err := mrw.ResponseWriter.Write(buf)
	mrw.ri.size += s
	return s, err
}

// WriteHeader メソッドをオーバーライド
func (mrw *MonitoringResponseWriter) WriteHeader(statusCode int) {
	mrw.ri.status = statusCode
	mrw.ResponseWriter.WriteHeader(statusCode)
}

// Close io.Closerのような感じにしたけど特に意味は無い
func (mrw *MonitoringResponseWriter) Close() error {
	mrw.ri.end = time.Now().UTC()
	mrw.rich <- mrw.ri
	return nil
}

// インターフェイスのチェック
var _ http.ResponseWriter = &MonitoringResponseWriter{}
var _ http.Hijacker = &MonitoringResponseWriter{}
var _ http.Flusher = &MonitoringResponseWriter{}
var _ http.Pusher = &MonitoringResponseWriter{}

// Hijack implements http.Hijacker. If the underlying ResponseWriter is a
// Hijacker, its Hijack method is returned. Otherwise an error is returned.
func (mrw *MonitoringResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := mrw.ResponseWriter.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, fmt.Errorf("http.Hijacker interface is not supported")
}

// Flush http.Flusher interface
func (mrw *MonitoringResponseWriter) Flush() {
	flusher, ok := mrw.ResponseWriter.(http.Flusher)
	if ok {
		flusher.Flush()
	}
}

// Push http.Pusher interface
// go1.8以上が必要
func (mrw *MonitoringResponseWriter) Push(target string, opts *http.PushOptions) error {
	pusher, ok := mrw.ResponseWriter.(http.Pusher)
	if ok && pusher != nil {
		return pusher.Push(target, opts)
	}
	return http.ErrNotSupported
}
