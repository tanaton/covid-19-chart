import * as chart from "./chart"

const summaryUrl = "/data/daily_reports/summary.json";

export interface IClient<QueryStrT> {
	run(query: string): void;
	dispose(): void;
	setDefaultQuery(): void;
	getQuery(): Query<QueryStrT>;
	initQuery(query: string): void;
	loadQuery(query: string): void;
	createQuery(query?: Query<QueryStrT>): string;
	updateQuery(query?: Query<QueryStrT>): void;
	update(pair: [QueryStrT, string][]): void;
	change(): void;
}

export class Query<QueryStrT> {
	private query: string[] = [];
	private queryIndex: { [key in string]: number } = {};
	constructor() {
		this.init();
	}
	public init(): void {
		this.query = [];
		this.queryIndex = {};
	}
	public set(key: QueryStrT & string, val: string): void {
		if (this.queryIndex[key] === undefined) {
			this.queryIndex[key] = this.query.length;
			this.query.push(val);
		} else {
			this.query[this.queryIndex[key]] = val;
		}
	}
	public get(key: QueryStrT & string): string {
		return this.query[this.queryIndex[key]] ?? "";
	}
	public copy(): Query<QueryStrT> {
		const q = new Query<QueryStrT>();
		q.query = this.query.concat();
		for (const key in this.queryIndex) {
			if (this.queryIndex.hasOwnProperty(key)) {
				q.queryIndex[key] = this.queryIndex[key];
			}
		}
		return q;
	}
	public filter(f: (key: QueryStrT, val: string) => boolean): Query<QueryStrT> {
		const q = new Query<QueryStrT>();
		for (const key in this.queryIndex) {
			if (this.queryIndex.hasOwnProperty(key)) {
				const index = this.queryIndex[key];
				const k = key as QueryStrT & string;
				if (f(k, this.query[index])) {
					q.query[index] = this.query[index];
					q.queryIndex[key] = index;
				}
			}
		}
		return q;
	}
	public toString(): string {
		const url = new URLSearchParams();
		for (const key in this.queryIndex) {
			if (this.queryIndex.hasOwnProperty(key)) {
				url.append(key, this.query[this.queryIndex[key]]);
			}
		}
		const query = url.toString();
		return query !== "" ? "?" + query : "";
	}
}

export abstract class BaseClient<QueryStrT, ScaleT> implements IClient<QueryStrT> {
	protected chart: chart.IChart<ScaleT>;
	protected query: Query<QueryStrT>;

	constructor(c: chart.IChart<ScaleT>) {
		this.query = new Query<QueryStrT>();
		this.chart = c;
		this.setDefaultQuery();
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
	public getQuery(): Query<QueryStrT> {
		return this.query.copy();
	}
	public abstract initQuery(query: string): void;
	public abstract loadQuery(query: string): void;
	public abstract createQuery(query?: Query<QueryStrT>): string;
	public updateQuery(queryList?: Query<QueryStrT>): void {
		const query = this.createQuery(queryList);
		if (query !== location.search) {
			window.history.pushState("", "", location.pathname + query);
			this.updatePage();
		} else {
			// 正規化
			window.history.replaceState("", "", location.pathname + query);
		}
	}
	private updatePage(): void {
		const oldquery = this.createQuery();
		this.loadQuery(location.search);
		const nowquery = this.createQuery();
		if (nowquery !== oldquery) {
			this.change();
		} else {
			// 正規化
			window.history.replaceState("", "", location.pathname + nowquery);
		}
	}
	public abstract change(): void;
	public update(pair: [QueryStrT, string][]): void {
		const query = this.getQuery();
		for (const it of pair) {
			const key = it[0] as QueryStrT & string;
			query.set(key, it[1]);
		}
		this.updateQuery(query);
	}
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
