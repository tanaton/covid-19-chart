import * as chart from "./chart"

const summaryUrl = "/data/daily_reports/summary.json";

export interface IClient<QueryStrT> {
	run(query: string): void;
	dispose(): void;
	setDefaultQuery(): void;
	getQuery(): [QueryStrT, string][];
	initQuery(query: string): void;
	loadQuery(query: string): void;
	createQuery(query?: [QueryStrT, string][]): string;
	updateQuery(query?: [QueryStrT, string][]): void;
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
	public run(query: string = ""): void {
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
			this.initQuery(query);
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
	public abstract initQuery(query: string): void;
	public abstract loadQuery(query: string): void;
	public abstract createQuery(query?: [QueryStrT, string][]): string;
	public updateQuery(queryList?: [QueryStrT, string][]): void {
		const query = this.createQuery(queryList);
		if (query !== location.search) {
			window.history.pushState("", "", location.pathname + query);
			this.updatePage();
		}
	}
	private updatePage(): void {
		const oldquery = this.createQuery();
		this.loadQuery(location.search);
		const nowquery = this.createQuery();
		if (nowquery !== oldquery) {
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
