import * as chart from "./chart"

const summaryUrl = "/data/daily_reports/summary.json";

export interface IClient<QueryStrT> {
	run(hash: string): void;
	dispose(): void;
	setDefaultQuery(): void;
	getQuery(): [QueryStrT, string][];
	initHash(hash: string): void;
	loadHash(hash: string): void;
	createHash(query?: [QueryStrT, string][]): string;
	updateHash(query?: [QueryStrT, string][]): void;
	change(): void;
}

export abstract class BaseClient<QueryStrT, ScaleT> implements IClient<QueryStrT> {
	protected chart: chart.IChart<ScaleT>;
	protected query: [QueryStrT, string][];

	constructor(c: chart.IChart<ScaleT>) {
		this.query = [];
		this.chart = c;
		window.addEventListener("popstate", () => this.updatePage(), false);
	}
	public run(hash: string = ""): void {
		const httpget = (url: string): Promise<chart.WorldSummary> => {
			return new Promise<chart.WorldSummary>((resolve, reject) => {
				BaseClient.get(url, xhr => {
					resolve(JSON.parse(xhr.responseText));
				}, (txt: string) => {
					reject(txt);
				});
			});
		};
		httpget(summaryUrl).then(value => {
			this.chart.addData(value);
			this.initHash(hash);
			this.change();
		}).catch(error => {
			console.error(error);
		});
	}
	public dispose(): void {
		this.chart?.dispose();
	}
	public abstract setDefaultQuery(): void;
	public getQuery(): [QueryStrT, string][] {
		return this.query.map<[QueryStrT, string]>(it => [it[0], it[1]]);
	}
	public abstract initHash(hash: string): void;
	public abstract loadHash(hash: string): void;
	public abstract createHash(query?: [QueryStrT, string][]): string;
	public updateHash(query?: [QueryStrT, string][]): void {
		const hash = this.createHash(query);
		if (hash !== location.search) {
			window.history.pushState("", "", location.pathname + hash);
			this.updatePage();
		}
	}
	private updatePage(): void {
		const oldhash = this.createHash();
		this.loadHash(location.search);
		const nowhash = this.createHash();
		if (nowhash !== oldhash) {
			this.change();
		}
	}
	public abstract change(): void;
	public static get(url: string, func: (xhr: XMLHttpRequest) => void, err: (txt: string) => void) {
		const xhr = new XMLHttpRequest();
		xhr.ontimeout = () => {
			console.error(`The request for ${url} timed out.`);
			err("ontimeout");
		};
		xhr.onload = () => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					func(xhr);
				} else {
					console.error(xhr.statusText);
				}
			}
		};
		xhr.onerror = () => {
			console.error(xhr.statusText);
			err("onerror");
		};
		xhr.open("GET", url, true);
		xhr.timeout = 5000;		// 5秒
		xhr.send(null);
	}
}
