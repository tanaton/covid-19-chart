import * as chart from "./chart"

const summaryUrl = "/data/daily_reports/summary.json";

export class Query<QueryStrT extends string> implements Iterable<[QueryStrT, string]> {
	private query: [QueryStrT, string][] = [];
	private queryIndex: { [key in string]: number } = {};

	constructor() {
		this.init();
	}
	[Symbol.iterator]() {
		let index = 0;
		const query: readonly [QueryStrT, string][] = this.query;
		return {
			next(): IteratorResult<[QueryStrT, string]> {
				if (index < query.length) {
					return {
						done: false,
						value: query[index++]
					}
				} else {
					return {
						done: true,
						value: null
					}
				}
			}
		};
	}
	public init(): void {
		this.query = [];
		this.queryIndex = {};
	}
	public set(key: QueryStrT, val: string): void {
		if (this.queryIndex[key] === undefined) {
			this.queryIndex[key] = this.query.length;
			this.query.push([key, val]);
		} else {
			this.query[this.queryIndex[key]] = [key, val];
		}
	}
	public get(key: QueryStrT): string {
		return this.query[this.queryIndex[key]][1] ?? "";
	}
	public copy(): Query<QueryStrT> {
		const q = new Query<QueryStrT>();
		for (const [key, val] of this) {
			q.set(key, val);
		}
		return q;
	}
	public filter(filter: Query<QueryStrT>): Query<QueryStrT> {
		const q = new Query<QueryStrT>();
		for (const [key, val] of this) {
			if (val !== filter.get(key)) {
				q.set(key, val);
			}
		}
		return q;
	}
	public loadSearchParams(query?: string): void {
		const url = new URLSearchParams(query);
		for (const [key, value] of url) {
			this.set(key as QueryStrT, value);
		}
	}
	public toString(): string {
		const url = new URLSearchParams();
		for (const [key, val] of this) {
			url.append(key, val);
		}
		const query = url.toString();
		return query !== "" ? "?" + query : "";
	}
}

export interface IClient<QueryStrT extends string> {
	run(query: string): void;
	dispose(): void;
	update(pair: readonly [QueryStrT, string][]): void;
	change(): void;
}

export abstract class BaseClient<QueryStrT extends string, ScaleT> implements IClient<QueryStrT> {
	protected chart: chart.IChart<ScaleT>;
	protected query: Query<QueryStrT>;

	constructor(c: chart.IChart<ScaleT>) {
		this.chart = c;
		this.query = this.createDefaultQuery();
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
	public abstract createDefaultQuery(): Query<QueryStrT>;
	public getQuery(): Query<QueryStrT> {
		return this.query.copy();
	}
	public abstract initQuery(query: string): void;
	public abstract loadQuery(query: string): void;
	public createQuery(querylist?: Query<QueryStrT>): string {
		if (!querylist) {
			querylist = this.query;
		}
		return querylist.filter(this.createDefaultQuery()).toString();
	}
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
	public update(pair: readonly [QueryStrT, string][]): void {
		const query = this.getQuery();
		for (const [key, val] of pair) {
			query.set(key, val);
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
