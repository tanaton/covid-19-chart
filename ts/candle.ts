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
	start: Date;
	end: Date;
	open: number;
	close: number;
	high: number;
	low: number;
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
const svgIDcandle = "svgcandle";
const summaryUrl = "/data/daily_reports/summary.json";
const defaultHash = "#country=Japan&category=confirmed&yscale=liner";
const timeFormat = d3.timeFormat("%Y/%m/%d");
const formatNumberConmma = d3.format(",d");
const candle_xd_default: readonly [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
const candle_yd_default: readonly [number, number] = [0, 0];
const base64encode = (str: string): string => window.btoa(unescape(encodeURIComponent(str)));
const base64decode = (str: string): string => decodeURIComponent(escape(window.atob(str)));
const atoi = (str: string): number => parseInt(str, 10);
const strToDate = (str: string): Date => {
	const datearray = str.split("/").map<number>(atoi);
	// 月は-1しないと期待通りに動作しない
	return new Date(datearray[0], datearray[1] - 1, datearray[2]);
}

class CandleChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private candle?: d3.Selection<SVGGElement, ChartPathData, SVGSVGElement, unknown>;
	private candle_x: d3.ScaleTime<number, number>;
	private candle_yLiner: d3.ScaleLinear<number, number>;
	private candle_yLog: d3.ScaleLogarithmic<number, number>;
	private candle_y: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private candle_xAxis: d3.Axis<Date>;
	private candle_yAxis: d3.Axis<number>;
	private candle_color: d3.ScaleOrdinal<string, string>;
	private candle_rect_stroke: (d: ChartPathData, i: number) => string;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private candledata: ChartPathData[];
	private raw?: WorldSummary;
	private target: NumberStr;
	private candlewidth: number;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1600;
		this.height = Math.min(this.width, 720) - this.margin.top - this.margin.bottom;
		this.width = this.width - this.margin.left - this.margin.right;
		this.target = dispdata.nowcategory;
		this.candledata = [];
		this.candlewidth = 10;

		this.svg = d3.select("#" + this.svgid).append("svg");
		this.svg
			.attr("width", this.width + this.margin.left + this.margin.right + 10)
			.attr("height", this.height + this.margin.top + this.margin.bottom + 10);

		this.candle_x = d3.scaleTime()
			.domain(candle_xd_default.concat())
			.range([0, this.width]);
		this.candle_xAxis = d3.axisBottom<Date>(this.candle_x)
			.tickSizeInner(-this.height)
			.tickFormat(timeFormat)
			.tickPadding(7)
			.ticks(5);
		this.candle_yLiner = d3.scaleLinear();
		this.candle_yLog = d3.scaleLog().clamp(true);
		this.candle_y = this.candle_yLiner;
		this.candle_yAxis = d3.axisLeft<number>(this.candle_yLiner)
			.tickSizeInner(-this.width)
			.tickFormat(formatNumberConmma)
			.tickPadding(7)
			.ticks(5);
		this.resetYScale(dispdata.nowyscale);

		this.candle_color = d3.scaleOrdinal<string>().range(["#b94047", "#47ba41", "#4147ba", "#bab441", "#41bab4", "#b441ba"]);
		this.candle_color.domain(["red", "green", "blue"]);
		this.candle_rect_stroke = d => (d.open > d.close) ? this.candle_color("red") : this.candle_color("green");
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
		return this.candledata.concat();
	}
	public changeData(target: NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.target = target;
		this.candledata = [];

		const index = NumberIndex[target];
		const countrys = this.raw.countrys;
		const line_yd = this.candle_y.domain();
		const line_xd = [
			strToDate(dispdata.slider.xaxis.value[0]),
			strToDate(dispdata.slider.xaxis.value[1])
		];
		line_yd[1] = candle_yd_default[1];

		const key = base64decode(dispdata.nowcountry);
		if (countrys.hasOwnProperty(key)) {
			let yesterday = 0;
			let footstart: Date | undefined;
			let date: Date | undefined;
			let open = 0;
			let close = 0;
			let high = 0;
			let low = 0;
			for (const it of countrys[key].daily) {
				date = strToDate(it.date);
				if (footstart === undefined) {
					footstart = date;
				}
				const data = Math.max(it.cdr[index] - yesterday, 0);
				yesterday = it.cdr[index];
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
				close = data;
				if (data > high) {
					high = data;
				}
				if (data < low) {
					low = data;
				}
				if (date.getDay() === 1) {
					// 月曜日にリセット
					this.candledata.push({
						date: new Date(date.getTime() - 3600 * 24 * 1000 * 3.5),
						start: new Date(date.getTime() - 3600 * 24 * 1000 * 7),
						end: date,
						open: open,
						close: close,
						high: high,
						low: low
					});
					open = close;
					high = close;
					low = close;
				}
			}
			if (date && date.getDay() !== 1) {
				// 最終日が月曜日以外ならデータ追加
				const monday = (date.getDay() + 6) % 7; // 月曜日からの経過日数を取得
				const start = new Date(date.getTime() - 3600 * 24 * 1000 * monday);
				this.candledata.push({
					date: new Date(start.getTime() + 3600 * 24 * 1000 * 3.5),
					start: start,
					end: date,
					open: open,
					close: close,
					high: high,
					low: low
				});
			}
			dispdata.confirmed_now = formatNumberConmma(countrys[key].cdr[0]);
			dispdata.deaths_now = formatNumberConmma(countrys[key].cdr[1]);
			dispdata.recovered_now = formatNumberConmma(countrys[key].cdr[2]);
		}

		if (this.candledata && this.candledata.length > 0) {
			const start = line_xd[0].getTime();
			const end = line_xd[1].getTime();
			this.candlewidth = Math.max(Math.floor((this.width / Math.max((end - start) / (3600 * 24 * 1000 * 7), 1)) * 0.95), 3);
		} else {
			this.candlewidth = 10;
		}
		this.candle_x.domain(line_xd);
		this.candle_y.domain(line_yd);
		this.candle_y.nice();

		dispdata.slider.xaxis.value[0] = timeFormat(line_xd[0]);
		dispdata.slider.xaxis.value[1] = timeFormat(line_xd[1]);
	}
	public addData(raw: WorldSummary): void {
		this.raw = raw;
		dispdata.countrys = [];
		const line_xd = candle_xd_default.concat();

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
		const line_yd = this.candle_y.domain();
		switch (scale) {
			case "liner":
				this.candle_y = this.candle_yLiner;
				line_yd[0] = 0;
				break;
			case "log":
				this.candle_y = this.candle_yLog;
				line_yd[0] = 1;
				break;
			default:
				this.candle_y = this.candle_yLiner;
				line_yd[0] = 0;
				break;
		}
		this.candle_y.range([this.height, 0]);
		this.candle_y.domain(line_yd);
		this.candle_y.nice();
		this.candle_yAxis.scale(this.candle_y);
	}
	public draw(): void {
		if (!this.candledata) {
			// undefinedチェック
			return;
		}

		this.candle = this.svg.selectAll<SVGGElement, ChartPathData>(".candle")
			.data(this.candledata)
			.enter()
			.append("g")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.attr("class", "candle");

		// ローソク本体
		this.candle.append("rect")
			.style("fill", this.candle_rect_stroke)
			.attr("x", d => this.candle_x(d.date) - (this.candlewidth / 2))
			.attr("y", d => Math.min(this.candle_y(d.open), this.candle_y(d.close)))  // 画面の上の方が数値が小さい
			.attr("width", this.candlewidth)
			.attr("height", d => Math.max(Math.abs(this.candle_y(d.open) - this.candle_y(d.close)), 2));

		// 値動きの範囲
		this.candle.append("line")
			.attr("x1", d => this.candle_x(d.date))
			.attr("y1", d => this.candle_y(d.high))
			.attr("x2", d => this.candle_x(d.date))
			.attr("y2", d => this.candle_y(d.low))
			.attr("stroke-width", 2)
			.style("stroke", this.candle_rect_stroke);

		this.candle.append("title")
			.text(d => `date:${timeFormat(d.start)}-${timeFormat(d.end)}\nopen:${d.open}\nclose:${d.close}\nhigh:${d.high}\nlow:${d.low}`);

		this.svg.append("g")				// 全体x目盛軸
			.attr("class", "x axis")
			.attr("transform", `translate(${this.margin.left},${this.height + this.margin.top})`)
			.call(this.candle_xAxis);

		this.svg.append("g")				// 全体y目盛軸
			.attr("class", "y axis")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.call(this.candle_yAxis);
	}
}

class Client {
	private candle: CandleChart;
	private query: [QueryStr, string][];
	private startdate: string;
	private enddate: string;

	constructor(hash: string = defaultHash) {
		this.startdate = "2020/04/01";
		this.enddate = "2020/04/10";
		this.query = [];
		this.setDefaultQuery();
		this.loadHash(hash);
		this.updateHash();
		this.candle = new CandleChart(svgIDcandle);
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
			this.candle.addData(value);
			this.change();
			// 最初のハッシュ構築
			this.initHash();
		}).catch(error => {
			console.error(error);
		});
	}
	public dispose(): void {
		this.candle?.dispose();
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
		return "#" + query.filter((it, i) => {
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
		return this.candle.getLineData();
	}
	public change(): void {
		this.candle.clear();
		this.candle.resetYScale(dispdata.nowyscale);
		this.candle.changeData(dispdata.nowcategory);
		this.candle.draw();
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
let cli = new Client(location.hash);
cli.run();
window.addEventListener("hashchange", () => {
	const oldhash = cli.createHash();
	cli.loadHash(location.hash);
	const hash = cli.createHash();
	if (hash !== oldhash) {
		cli.change();
	}
}, false);
