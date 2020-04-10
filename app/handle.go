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
	ch <-chan ResultMonitor
}

func (h *GetMonitoringHandler) getResultMonitor(ctx context.Context) (ResultMonitor, error) {
	var res ResultMonitor
	lctx, lcancel := context.WithTimeout(ctx, time.Second*3)
	defer lcancel()
	select {
	case <-lctx.Done():
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

type Alias interface {
	GetPath() string
	SetPath(p string)
}

type AliasHandler struct {
	sync.RWMutex
	path string
}

func (h *AliasHandler) GetPath() string {
	h.RLock()
	defer h.RUnlock()
	return h.path
}

func (h *AliasHandler) SetPath(p string) {
	h.Lock()
	defer h.Unlock()
	h.path = p
}

func (h *AliasHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, h.GetPath())
}
