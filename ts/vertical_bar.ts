import * as d3 from 'd3';
import Vue from 'vue';
import VueSlider from 'vue-slider-component';

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
	date: Date;
	data: number;
}

type NumberStr = "confirmed" | "deaths" | "recovered";
type YScaleType = "liner" | "log";
type QueryStr = "country" | "category" | "yscale" | "startdate" | "enddate";

type Display = {
	confirmed_now: string;
	deaths_now: string;
	recovered_now: string;
	categorys: Array<{ id: NumberStr, name: string }>;
	yscales: Array<{ id: YScaleType, name: string }>;
	countrys: Array<{
		id: string,
		name: string,
		data: CDR,
		checked: boolean
	}>;
	slider: {
		xaxis: {
			value: string[];
			data: string[];
		};
	};
	nowcategory: NumberStr;
	nowyscale: YScaleType;
	nowcountry: string;
}

const NumberIndex: { readonly [key in NumberStr]: number } = {
	confirmed: 0,
	deaths: 1,
	recovered: 2,
};
const HashIndex: { readonly [key in QueryStr]: number } = {
	country: 0,
	category: 1,
	yscale: 2,
	startdate: 3,
	enddate: 4
};
const svgIDvbar = "svgvbar";
const summaryUrl = "/data/daily_reports/summary.json";
const timeFormat = d3.timeFormat("%Y/%m/%d");
const formatNumberConmma = d3.format(",d");
const vbar_xd_default: readonly [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
const vbar_yd_default: readonly [number, number] = [0, 0];
const base64encode = (str: string): string => window.btoa(unescape(encodeURIComponent(str)));
const base64decode = (str: string): string => decodeURIComponent(escape(window.atob(str)));
const atoi = (str: string): number => parseInt(str, 10);
const strToDate = (str: string): Date => {
	const datearray = str.split("/").map<number>(atoi);
	// 月は-1しないと期待通りに動作しない
	return new Date(datearray[0], datearray[1] - 1, datearray[2]);
}

class VerticalBarChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private vbar?: d3.Selection<SVGGElement, ChartPathData, SVGSVGElement, unknown>;
	private vbar_x: d3.ScaleTime<number, number>;
	private vbar_y: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private vbar_xAxis: d3.Axis<Date>;
	private vbar_yAxis: d3.Axis<number>;
	private vbar_color: d3.ScaleOrdinal<string, string>;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private vbardata: ChartPathData[];
	private barwidth: number;
	private raw?: WorldSummary;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1600;
		this.height = Math.min(this.width, 720) - this.margin.top - this.margin.bottom;
		this.width = this.width - this.margin.left - this.margin.right;
		this.vbardata = [];
		this.barwidth = 10;

		this.svg = d3.select("#" + this.svgid).append("svg");
		this.svg
			.attr("width", this.width + this.margin.left + this.margin.right + 10)
			.attr("height", this.height + this.margin.top + this.margin.bottom + 10);

		this.vbar_x = d3.scaleTime()
			.domain(vbar_xd_default.concat())
			.range([0, this.width]);
		this.vbar_y = d3.scaleLinear()
			.domain(vbar_yd_default.concat())
			.range([this.height, 0]);
		this.vbar_xAxis = d3.axisBottom<Date>(this.vbar_x)
			.tickSizeInner(-this.height)
			.tickFormat(timeFormat)
			.tickPadding(7)
			.ticks(5);
		this.vbar_yAxis = d3.axisLeft<number>(this.vbar_y)
			.tickSizeInner(-this.width)
			.tickPadding(7)
			.ticks(5);

		this.vbar_color = d3.scaleOrdinal(d3.schemeCategory10);
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
	public getLineData(): Readonly<ChartPathData[]> {
		return this.vbardata.concat();
	}
	public changeData(target: NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.vbardata = [];

		const index = NumberIndex[target];
		const countrys = this.raw.countrys;
		const line_yd = this.vbar_y.domain();
		const line_xd = [
			strToDate(dispdata.slider.xaxis.value[0]),
			strToDate(dispdata.slider.xaxis.value[1])
		];
		line_yd[1] = vbar_yd_default[1];

		const key = base64decode(dispdata.nowcountry);
		if (countrys.hasOwnProperty(key)) {
			let yesterday = 0;
			for (const it of countrys[key].daily) {
				const data = Math.max(it.cdr[index] - yesterday, 0);
				yesterday = it.cdr[index];
				const date = strToDate(it.date);
				if (date.getTime() < line_xd[0].getTime() || date.getTime() > line_xd[1].getTime()) {
					continue;
				}
				if (data > line_yd[1]) {
					line_yd[1] = data;
				}
				if (date.getTime() < line_xd[0].getTime()) {
					line_xd[0] = date;
				}
				if (date.getTime() > line_xd[1].getTime()) {
					line_xd[1] = date;
				}
				this.vbardata.push({
					date: date,
					data: Math.max(data, 0)
				});
			}
			dispdata.confirmed_now = formatNumberConmma(countrys[key].cdr[0]);
			dispdata.deaths_now = formatNumberConmma(countrys[key].cdr[1]);
			dispdata.recovered_now = formatNumberConmma(countrys[key].cdr[2]);
		}
		const len = ((line_xd[1].getTime() - line_xd[0].getTime()) / (3600 * 24 * 1000)) + 1;
		this.barwidth = Math.floor(this.width / len);
		this.vbar_x.domain(line_xd);
		this.vbar_y.domain(line_yd);
		this.vbar_y.nice();

		dispdata.slider.xaxis.value[0] = timeFormat(line_xd[0]);
		dispdata.slider.xaxis.value[1] = timeFormat(line_xd[1]);
	}
	public addData(raw: WorldSummary): void {
		this.raw = raw;
		dispdata.countrys = [];
		const line_xd = vbar_xd_default.concat();

		for (const key in raw.countrys) {
			if (!raw.countrys.hasOwnProperty(key)) {
				continue;
			}
			const daily = raw.countrys[key].daily;
			if (daily && daily.length > 0) {
				const start = strToDate(daily[0].date);
				const last = daily[daily.length - 1];
				const end = strToDate(last.date);
				if (start.getTime() < line_xd[0].getTime()) {
					line_xd[0] = start;
				}
				if (end.getTime() > line_xd[1].getTime()) {
					line_xd[1] = end;
				}
				const cdr = last.cdr;
				dispdata.countrys.push({
					id: base64encode(key), // カンマとかスペースとかを適当な文字にする
					name: key,
					data: [cdr[0], cdr[1], cdr[2]],
					checked: true
				});
			}
		}
		dispdata.slider.xaxis.value = [timeFormat(line_xd[0]), timeFormat(line_xd[1])];
		let date: Date = new Date(line_xd[0].getTime());
		while (date <= line_xd[1]) {
			dispdata.slider.xaxis.data.push(timeFormat(date));
			date = new Date(date.getTime() + 60 * 60 * 24 * 1000);
		}
	}
	public resetYScale(scale: YScaleType) {
		const line_yd = this.vbar_y.domain();
		switch (scale) {
			case "liner":
				this.vbar_y = d3.scaleLinear();
				line_yd[0] = 0;
				break;
			case "log":
				this.vbar_y = d3.scaleLog().clamp(true);
				line_yd[0] = 1;
				break;
			default:
				this.vbar_y = d3.scaleLinear();
				line_yd[0] = 0;
				break;
		}
		this.vbar_y.range([this.height, 0]);
		this.vbar_y.domain(line_yd);
		this.vbar_y.nice();

		this.vbar_yAxis = d3.axisLeft<number>(this.vbar_y)
			.tickSizeInner(-this.width)
			.tickFormat(formatNumberConmma)
			.tickPadding(7)
			.ticks(5);
	}
	public draw(): void {
		if (!this.vbardata) {
			// undefinedチェック
			return;
		}

		this.vbar = this.svg.selectAll<SVGGElement, ChartPathData>(".vbar")
			.data(this.vbardata)
			.enter()
			.append("g")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.attr("class", "vbar");

		this.vbar.append("rect")
			.style("fill", this.vbar_color(base64decode(dispdata.nowcountry)))
			.attr("x", d => this.vbar_x(d.date) - (this.barwidth / 2))
			.attr("y", d => this.vbar_y(d.data))
			.attr("width", this.barwidth)
			.attr("height", d => Math.abs(this.vbar_y(0) - this.vbar_y(d.data)));

		this.vbar.append("title")
			.text(d => `date:${timeFormat(d.date)}\ndata:${formatNumberConmma(d.data)}`);

		this.svg.append("g")				// 全体x目盛軸
			.attr("class", "x axis")
			.attr("transform", `translate(${this.margin.left},${this.height + this.margin.top})`)
			.call(this.vbar_xAxis);

		this.svg.append("g")				// 全体y目盛軸
			.attr("class", "y axis")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.call(this.vbar_yAxis);
	}
}

class Client {
	private vbar: VerticalBarChart;
	private query: [QueryStr, string][];
	private startdate: string;
	private enddate: string;

	constructor(hash: string = "") {
		this.startdate = "2020/04/01";
		this.enddate = "2020/04/10";
		this.query = [];
		this.setDefaultQuery();
		this.loadHash(hash);
		this.updateHash();
		this.vbar = new VerticalBarChart(svgIDvbar);
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
			this.vbar.addData(value);
			this.change();
			this.initHash();
		}).catch(error => {
			console.error(error);
		});
	}
	public dispose(): void {
		this.vbar?.dispose();
	}
	public setDefaultQuery(): void {
		this.query = [
			["country", "Japan"],
			["category", "confirmed"],
			["yscale", "liner"],
			["startdate", this.startdate],
			["enddate", this.enddate],
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
					this.query[HashIndex[qs]] = [qs, (qs === "country") ? decodeURI(it[1]) : it[1]];
				});
		}
		dispdata.nowcountry = base64encode(this.query[HashIndex["country"]][1]);
		dispdata.nowcategory = this.query[HashIndex["category"]][1] as NumberStr;
		dispdata.nowyscale = this.query[HashIndex["yscale"]][1] as YScaleType;
		dispdata.slider.xaxis.value[0] = this.query[HashIndex["startdate"]][1];
		dispdata.slider.xaxis.value[1] = this.query[HashIndex["enddate"]][1];
	}
	public dispdataToQuery(): void {
		this.query[HashIndex["country"]][1] = base64decode(dispdata.nowcountry);
		this.query[HashIndex["category"]][1] = dispdata.nowcategory;
		this.query[HashIndex["yscale"]][1] = dispdata.nowyscale;
		this.query[HashIndex["startdate"]][1] = dispdata.slider.xaxis.value[0];
		this.query[HashIndex["enddate"]][1] = dispdata.slider.xaxis.value[1];
	}
	public createHash(query?: [QueryStr, string][]): string {
		if (!query) {
			query = this.query;
		}
		return "#" + query.filter(it => {
			if (it[0] === "country" && it[1] === "Japan") {
				return false;
			} else if (it[0] === "category" && it[1] === "confirmed") {
				return false;
			} else if (it[0] === "yscale" && it[1] === "liner") {
				return false;
			} else if (it[0] === "startdate" && it[1] === this.startdate) {
				return false;
			} else if (it[0] === "enddate" && it[1] === this.enddate) {
				return false;
			}
			return true;
		}).map(it => {
			if (it[0] === "country") {
				return it[0] + "=" + encodeURI(it[1]);
			}
			return it.join("=");
		}).join("&");
	}
	public updateHash(query?: [QueryStr, string][]): void {
		const hash = this.createHash(query);
		if (hash !== location.hash) {
			location.hash = hash;
		}
	}
	private initHash(): void {
		const data = dispdata.slider.xaxis.data;
		if (data.length >= 2) {
			this.startdate = data[0];
			this.enddate = data[data.length - 1];
		}
		this.dispdataToQuery();
		this.updateHash();
	}
	public getLineData(): Readonly<Array<ChartPathData>> {
		return this.vbar.getLineData();
	}
	public change(): void {
		this.vbar.clear();
		this.vbar.resetYScale(dispdata.nowyscale);
		this.vbar.changeData(dispdata.nowcategory);
		this.vbar.draw();
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

const dispdata: Display = {
	confirmed_now: "",
	deaths_now: "",
	recovered_now: "",
	categorys: [
		{ id: "confirmed", name: "感染数" },
		{ id: "deaths", name: "死亡数" },
		{ id: "recovered", name: "回復数" }
	],
	yscales: [
		{ id: "liner", name: "線形" },
		{ id: "log", name: "対数" },
	],
	countrys: [],
	slider: {
		xaxis: {
			value: [],
			data: []
		}
	},
	nowcategory: "confirmed",
	nowyscale: "liner",
	nowcountry: base64encode("Japan")
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
		yscaleChange: () => {
			const query = cli.getQuery();
			query[HashIndex["yscale"]][1] = dispdata.nowyscale;
			cli.updateHash(query);
		},
		countryChange: () => {
			const query = cli.getQuery();
			query[HashIndex["country"]][1] = base64decode(dispdata.nowcountry);
			cli.updateHash(query);
		},
		sliderChange: () => {
			const query = cli.getQuery();
			query[HashIndex["startdate"]][1] = dispdata.slider.xaxis.value[0];
			query[HashIndex["enddate"]][1] = dispdata.slider.xaxis.value[1];
			cli.updateHash(query);
		}
	},
	computed: {
		nowcountrystr: () => base64decode(dispdata.nowcountry)
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
