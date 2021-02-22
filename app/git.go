package app

import (
	"context"
	"os"

	"github.com/go-git/go-git"
)

func updateGitData(ctx context.Context) error {
	clone, err := checkGit(ctx)
	if err != nil {
		return err
	} else if clone {
		return nil
	}
	err = updateGit(ctx, GitPath)
	if err == git.NoErrAlreadyUpToDate {
		return errNoUpdate
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
	err = w.Checkout(&git.CheckoutOptions{Force: true})
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
