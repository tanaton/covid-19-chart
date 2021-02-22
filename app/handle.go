package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"
)

type GetMonitoringHandler struct {
	ch <-chan resultMonitor
}

func (h *GetMonitoringHandler) getResultMonitor(ctx context.Context) (resultMonitor, error) {
	var res resultMonitor
	ctx, cancel := context.WithTimeout(ctx, time.Second*3)
	defer cancel()
	select {
	case <-ctx.Done():
		return res, errors.New("timeout")
	case res = <-h.ch:
		log.Debugw("受信！ getResultMonitor", "data", res)
	}
	return res, nil
}

func (h *GetMonitoringHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	res, err := h.getResultMonitor(r.Context())
	if err == nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		err := json.NewEncoder(w).Encode(res)
		if err != nil {
			log.Warnw("JSON出力に失敗しました。", "error", err, "path", r.URL.Path)
		}
	} else {
		http.Error(w, "データ取得に失敗しました。", http.StatusInternalServerError)
	}
}

type alias interface {
	getPath() string
	setPath(p string)
}

type aliasHandler struct {
	sync.RWMutex
	path string
}

func (h *aliasHandler) getPath() string {
	h.RLock()
	defer h.RUnlock()
	return h.path
}

func (h *aliasHandler) setPath(p string) {
	h.Lock()
	defer h.Unlock()
	h.path = p
}

func (h *aliasHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, h.getPath())
}
