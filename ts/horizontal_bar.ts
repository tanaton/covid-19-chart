import * as d3 from 'd3';
import Vue from 'vue';
import VueSlider from 'vue-slider-component';
import { thresholdFreedmanDiaconis } from 'd3';

type Box = {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

type CDR = [number, number, number];

type DatasetSimple = {
	date: string,
	cdr: CDR
}
type CountrySummary = {
	daily: DatasetSimple[],
	cdr: CDR
}
type WorldSummary = {
	countrys: { [key in string]: CountrySummary },
	cdr: CDR
}

type ChartPathData = {
	name: string;
	data: number;
}

type ChartDataCountry = {
	name: string;
	cdr: CDR;
}

type ChartDataCountrys = {
	[key in string]: {
		date: Date,
		values: ChartDataCountry[];
	}
}

type NumberStr = "confirmed" | "deaths" | "recovered";
type XScaleType = "liner" | "log";
type QueryStr = "category" | "rank" | "xscale" | "date";

type Display = {
	categorys: Array<{ id: NumberStr, name: string }>;
	xscales: Array<{ id: XScaleType, name: string }>;
	slider: {
		date: {
			value: string;
			data: string[];
		};
	};
	ranks: Array<{ id: string, name: string, value: string }>;
	nowcategory: NumberStr;
	nowxscale: XScaleType;
	nowrank: string;
}

const NumberIndex: { readonly [key in NumberStr]: number } = {
	confirmed: 0,
	deaths: 1,
	recovered: 2,
};
const HashIndex: { readonly [key in QueryStr]: number } = {
	category: 0,
	rank: 1,
	xscale: 2,
	date: 3
};
const svgIDhbar = "svghbar";
const summaryUrl = "/data/daily_reports/summary.json";
const timeFormat = d3.timeFormat("%Y/%m/%d");
const formatNumberConmma = d3.format(",d");
const line_xd_default: readonly [number, number] = [0, 0];
const line_yd_default: readonly [number, number] = [0, 0];
const base64encode = (str: string): string => window.btoa(unescape(encodeURIComponent(str)));
const base64decode = (str: string): string => decodeURIComponent(escape(window.atob(str)));
const atoi = (str: string): number => parseInt(str, 10);
const strToDate = (str: string): Date => {
	const datearray = str.split("/").map<number>(atoi);
	// 月は-1しないと期待通りに動作しない
	return new Date(datearray[0], datearray[1] - 1, datearray[2]);
}

class HorizontalBarChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private hbar?: d3.Selection<SVGGElement, ChartPathData, SVGSVGElement, unknown>;
	private hbar_x: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private hbar_y: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private hbar_xAxis: d3.Axis<number>;
	private hbar_yAxis: d3.Axis<number>;
	private hbar_color: d3.ScaleOrdinal<string, string>;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private hbardata: Array<ChartPathData>;
	private data: ChartDataCountrys;
	private nowdatestr: string;
	private raw?: WorldSummary;
	private barheight: number;
	private rank: number;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1600;
		this.height = Math.min(this.width, 720) - this.margin.top - this.margin.bottom;
		this.width = this.width - this.margin.left - this.margin.right;
		this.hbardata = [];
		this.data = {};
		this.nowdatestr = "2020/04/01";
		this.barheight = 10;
		this.rank = 30;

		this.svg = d3.select("#" + this.svgid).append("svg");
		this.svg
			.attr("width", this.width + this.margin.left + this.margin.right + 10)
			.attr("height", this.height + this.margin.top + this.margin.bottom + 10);

		this.hbar_x = d3.scaleLinear()
			.domain(line_xd_default.concat())
			.range([0, this.width]);
		this.hbar_y = d3.scaleLinear()
			.domain(line_yd_default.concat())
			.range([this.height, 0]);
		this.hbar_xAxis = d3.axisBottom<number>(this.hbar_x)
			.tickSizeInner(-this.height)
			.tickPadding(7)
			.ticks(5);
		this.hbar_yAxis = d3.axisLeft<number>(this.hbar_y)
			.tickSizeInner(-this.width)
			.tickPadding(7)
			.ticks(5);

		this.hbar_color = d3.scaleOrdinal(d3.schemeCategory10);
	}
	public dispose(): void {
		const doc = document.getElementById(this.svgid);
		if (doc) {
			doc.innerHTML = "";
		}
	}
	public clear(): void {
		this.svg.selectAll("g").remove();
	}
	public getLineData(): Readonly<Array<ChartPathData>> {
		return this.hbardata.concat();
	}
	public setRank(rank: string) {
		this.rank = atoi(rank);
	}
	public changeData(target: NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.hbardata = [];

		const index = NumberIndex[target];
		const datestr = dispdata.slider.date.value;
		const data = (this.data[datestr] !== undefined) ? this.data[datestr] : this.data[this.nowdatestr];
		const xd = [8_000_000_000, -8_000_000_000];

		data.values.sort((a, b) => b.cdr[index] - a.cdr[index]);
		const len = Math.min(data.values.length, this.rank);
		for (let i = 0; i < len; i++) {
			const it = data.values[i];
			const d = it.cdr[index];
			if (d < xd[0]) {
				xd[0] = d;
			}
			if (d > xd[1]) {
				xd[1] = d;
			}
			this.hbardata.push({
				name: it.name,
				data: d
			})
		}
		this.barheight = this.height / (this.hbardata.length ?? 1);
		this.hbar_x.domain(xd);
		this.hbar_x.nice();
		this.hbar_y.domain([len, 0]);
	}
	public addData(raw: WorldSummary): void {
		this.raw = raw;
		this.data = {};
		const daterange: [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];

		for (const key in raw.countrys) {
			if (!raw.countrys.hasOwnProperty(key)) {
				continue;
			}
			const daily = raw.countrys[key].daily;
			if (!daily || daily.length <= 0) {
				continue;
			}
			const start = strToDate(daily[0].date);
			const last = daily[daily.length - 1];
			const end = strToDate(last.date);
			if (start.getTime() < daterange[0].getTime()) {
				daterange[0] = start;
			}
			if (end.getTime() > daterange[1].getTime()) {
				daterange[1] = end;
			}
			for (const day of daily) {
				const date = strToDate(day.date);
				if (this.data[day.date] === undefined) {
					this.data[day.date] = {
						date: date,
						values: []
					}
				}
				this.data[day.date].values.push({
					name: key,
					cdr: [day.cdr[0], day.cdr[1], day.cdr[2]]
				});
			}
		}
		this.nowdatestr = timeFormat(daterange[1]);
		dispdata.slider.date.value = this.nowdatestr;
		let date: Date = new Date(daterange[0].getTime());
		while (date <= daterange[1]) {
			dispdata.slider.date.data.push(timeFormat(date));
			date = new Date(date.getTime() + 60 * 60 * 24 * 1000);
		}
	}
	public resetXScale(scale: XScaleType) {
		const xd = this.hbar_x.domain();
		switch (scale) {
			case "liner":
				this.hbar_x = d3.scaleLinear();
				xd[0] = 0;
				break;
			case "log":
				this.hbar_x = d3.scaleLog().clamp(true);
				xd[0] = 1;
				break;
			default:
				this.hbar_x = d3.scaleLinear();
				xd[0] = 0;
				break;
		}
		this.hbar_x.range([0, this.width]);
		this.hbar_x.domain(xd);
		this.hbar_x.nice();

		this.hbar_xAxis = d3.axisBottom<number>(this.hbar_x)
			.tickSizeInner(-this.height)
			.tickFormat(formatNumberConmma)
			.tickPadding(7)
			.ticks(5);
	}
	public draw(): void {
		if (!this.hbardata) {
			// undefinedチェック
			return;
		}

		this.hbar = this.svg.selectAll<SVGGElement, ChartPathData>(".hbar")
			.data(this.hbardata)
			.enter()
			.append("g")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.attr("class", "hbar");

		this.hbar.append("rect")
			.style("fill", d => this.hbar_color(d.name))
			.attr("x", 0)
			.attr("y", (d, i) => this.hbar_y(i))
			.attr("width", d => this.hbar_x(d.data))
			.attr("height", this.barheight);

		this.hbar.append("text")			// 国名
			.attr("class", "line")
			.attr("font-size", this.barheight + "px")
			.attr("x", d => this.hbar_x(d.data))
			.attr("y", (d, i) => this.hbar_y(i) + this.barheight)
			.style("fill", "black")
			.style("stroke", "black")
			.style("stroke-width", "0px")
			.text((d, i) => `${i + 1}. ${d.name}`);

		this.hbar.append("title")
			.text((d, i) => `country:${d.name}\nrank:${i + 1}\ndata:${formatNumberConmma(d.data)}`);

		this.svg.append("g")				// 全体x目盛軸
			.attr("class", "x axis")
			.attr("transform", `translate(${this.margin.left},${this.height + this.margin.top})`)
			.call(this.hbar_xAxis);

		this.svg.append("g")				// 全体y目盛軸
			.attr("class", "y axis")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.call(this.hbar_yAxis);
	}
}

class Client {
	private hbar: HorizontalBarChart;
	private query: [QueryStr, string][];
	private date: string;

	constructor(hash: string = "") {
		this.date = "2020/04/10";
		this.query = [];
		this.setDefaultQuery();
		this.loadHash(hash);
		this.updateHash();
		this.hbar = new HorizontalBarChart(svgIDhbar);
	}
	public run(): void {
		const httpget = (url: string): Promise<WorldSummary> => {
			return new Promise<WorldSummary>((resolve, reject) => {
				Client.get(url, xhr => {
					resolve(JSON.parse(xhr.responseText));
				}, (txt: string) => {
					reject(txt);
				});
			});
		};
		httpget(summaryUrl).then(value => {
			this.hbar.addData(value);
			this.change();
			this.initHash();
		}).catch(error => {
			console.error(error);
		});
	}
	public dispose(): void {
		this.hbar?.dispose();
	}
	public setDefaultQuery(): void {
		this.query = [
			["category", "confirmed"],
			["rank", "30"],
			["xscale", "liner"],
			["date", this.date]
		];
	}
	public getQuery(): [QueryStr, string][] {
		return this.query.map<[QueryStr, string]>(it => [it[0], it[1]]);
	}
	public loadHash(hash: string): void {
		if (!hash) {
			hash = location.hash;
		}
		this.setDefaultQuery();
		if (hash.indexOf("#") === 0) {
			hash.slice(1)
				.split("&")
				.map(it => it.split("="))
				.filter(it => it.length >= 2)
				.forEach(it => {
					const qs = it[0] as QueryStr;
					this.query[HashIndex[qs]] = [qs, it[1]];
				});
		}
		dispdata.nowcategory = this.query[HashIndex["category"]][1] as NumberStr;
		dispdata.nowrank = this.query[HashIndex["rank"]][1];
		dispdata.nowxscale = this.query[HashIndex["xscale"]][1] as XScaleType;
		dispdata.slider.date.value = this.query[HashIndex["date"]][1];
	}
	public dispdataToQuery(): void {
		this.query[HashIndex["category"]][1] = dispdata.nowcategory;
		this.query[HashIndex["rank"]][1] = dispdata.nowrank;
		this.query[HashIndex["xscale"]][1] = dispdata.nowxscale;
		this.query[HashIndex["date"]][1] = dispdata.slider.date.value;
	}
	public createHash(query?: [QueryStr, string][]): string {
		if (!query) {
			query = this.query;
		}
		return "#" + query.filter(it => {
			if (it[0] === "category" && it[1] === "confirmed") {
				return false;
			} else if (it[0] === "rank" && it[1] === "30") {
				return false;
			} else if (it[0] === "xscale" && it[1] === "liner") {
				return false;
			} else if (it[0] === "date" && it[1] === this.date) {
				return false;
			}
			return true;
		}).map(it => it.join("=")).join("&");
	}
	public updateHash(query?: [QueryStr, string][]): void {
		const hash = this.createHash(query);
		if (hash !== location.hash) {
			location.hash = hash;
		}
	}
	private initHash(): void {
		const data = dispdata.slider.date.data;
		if (data.length >= 1) {
			this.date = data[data.length - 1];
		}
		this.dispdataToQuery();
		this.updateHash();
	}
	public getLineData(): Readonly<Array<ChartPathData>> {
		return this.hbar.getLineData();
	}
	public change(): void {
		this.hbar.clear();
		this.hbar.setRank(dispdata.nowrank);
		this.hbar.resetXScale(dispdata.nowxscale);
		this.hbar.changeData(dispdata.nowcategory);
		this.hbar.draw();
	}
	public static get(url: string, func: (xhr: XMLHttpRequest) => void, err: (txt: string) => void) {
		const xhr = new XMLHttpRequest();
		xhr.ontimeout = (): void => {
			console.error(`The request for ${url} timed out.`);
			err("ontimeout");
		};
		xhr.onload = (e): void => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					func(xhr);
				} else {
					console.error(xhr.statusText);
				}
			}
		};
		xhr.onerror = (e): void => {
			console.error(xhr.statusText);
			err("onerror");
		};
		xhr.open("GET", url, true);
		xhr.timeout = 5000;		// 5秒
		xhr.send(null);
	}
}

const dispdata: Display = {
	categorys: [
		{ id: "confirmed", name: "感染数" },
		{ id: "deaths", name: "死亡数" },
		{ id: "recovered", name: "回復数" }
	],
	xscales: [
		{ id: "liner", name: "線形" },
		{ id: "log", name: "対数" },
	],
	slider: {
		date: {
			value: "2020/04/01",
			data: []
		}
	},
	ranks: [
		{ id: "rank10", name: "上位10ヶ国", value: "10" },
		{ id: "rank30", name: "上位30ヶ国", value: "30" },
		{ id: "rank50", name: "上位50ヶ国", value: "50" },
		{ id: "rank100", name: "上位100ヶ国", value: "100" },
	],
	nowcategory: "confirmed",
	nowxscale: "liner",
	nowrank: "30",
};
const vm = new Vue({
	el: "#container",
	data: dispdata,
	components: {
		'VueSlider': VueSlider,
	},
	methods: {
		categoryChange: () => {
			const query = cli.getQuery();
			query[HashIndex["category"]][1] = dispdata.nowcategory;
			cli.updateHash(query);
		},
		xscaleChange: () => {
			const query = cli.getQuery();
			query[HashIndex["xscale"]][1] = dispdata.nowxscale;
			cli.updateHash(query);
		},
		sliderChange: () => {
			const query = cli.getQuery();
			query[HashIndex["date"]][1] = dispdata.slider.date.value;
			cli.updateHash(query);
		},
		rankChange: () => {
			const query = cli.getQuery();
			query[HashIndex["rank"]][1] = dispdata.nowrank;
			cli.updateHash(query);
		}
	}
});
const cli = new Client(location.hash);
cli.run();
window.addEventListener("hashchange", () => {
	const oldhash = cli.createHash();
	cli.loadHash(location.hash);
	const hash = cli.createHash();
	if (hash !== oldhash) {
		cli.change();
	}
}, false);
