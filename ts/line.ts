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

type Context = {
	readonly name: string;
	values: ChartPathData[];
}

type NumberStr = "confirmed" | "deaths" | "recovered";
type YScaleType = "liner" | "log";
type QueryStr = "country" | "category" | "yscale" | "startdate" | "enddate";

type Display = {
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
const svgIDLine = "svgline";
const summaryUrl = "/data/daily_reports/summary.json";
const timeFormat = d3.timeFormat("%Y/%m/%d");
const formatNumberConmma = d3.format(",d");
const line_xd_default: readonly [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
const line_yd_default: readonly [number, number] = [0, 0];
const base64encode = (str: string): string => window.btoa(unescape(encodeURIComponent(str)));
const base64decode = (str: string): string => decodeURIComponent(escape(window.atob(str)));
const atoi = (str: string): number => parseInt(str, 10);
const strToDate = (str: string): Date => {
	const datearray = str.split("/").map<number>(atoi);
	// 月は-1しないと期待通りに動作しない
	return new Date(datearray[0], datearray[1] - 1, datearray[2]);
}

class LineChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private line?: d3.Selection<SVGGElement, Context, SVGSVGElement, unknown>;
	private line_x: d3.ScaleTime<number, number>;
	private line_y: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private line_xAxis: d3.Axis<Date>;
	private line_yAxis: d3.Axis<number>;
	private line_line: d3.Line<ChartPathData>;
	private line_path_d: (d: Context) => string | null;
	private line_color: d3.ScaleOrdinal<string, string>;
	private line_path_stroke: (d: { name: string }) => string;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private linedata: Array<Context>;
	private raw?: WorldSummary;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1600;
		this.height = Math.min(this.width, 720) - this.margin.top - this.margin.bottom;
		this.width = this.width - this.margin.left - this.margin.right;
		this.linedata = [];

		this.svg = d3.select("#" + this.svgid).append("svg");
		this.svg
			.attr("width", this.width + this.margin.left + this.margin.right + 10)
			.attr("height", this.height + this.margin.top + this.margin.bottom + 10);

		this.line_x = d3.scaleTime()
			.domain(line_xd_default.concat())
			.range([0, this.width]);
		this.line_y = d3.scaleLinear()
			.domain(line_yd_default.concat())
			.range([this.height, 0]);
		this.line_xAxis = d3.axisBottom<Date>(this.line_x)
			.tickSizeInner(-this.height)
			.tickFormat(timeFormat)
			.tickPadding(7)
			.ticks(5);
		this.line_yAxis = d3.axisLeft<number>(this.line_y)
			.tickSizeInner(-this.width)
			.tickPadding(7)
			.ticks(5);
		this.line_line = d3.line<ChartPathData>()
			.curve(d3.curveLinear)
			//.curve(d3.curveMonotoneX)
			//.curve(d3.curveStepAfter)
			.x(d => this.line_x(d.date))
			.y(d => this.line_y(d.data));
		this.line_path_d = d => this.line_line(d.values);

		this.line_color = d3.scaleOrdinal(d3.schemeCategory10);
		this.line_path_stroke = d => this.line_color(d.name);
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
	public getLineData(): Readonly<Array<Context>> {
		return this.linedata.concat();
	}
	public changeData(target: NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.linedata = [];

		const index = NumberIndex[target];
		const countrys = this.raw.countrys;
		const line_yd = this.line_y.domain();
		const line_xd = [
			strToDate(dispdata.slider.xaxis.value[0]),
			strToDate(dispdata.slider.xaxis.value[1])
		];
		line_yd[1] = line_yd_default[1];

		const visibleCountry: {
			[key in string]: {
				visible: boolean,
				index: number
			}
		} = {};
		let vindex = 0;
		for (const checkbox of dispdata.countrys) {
			if (checkbox.checked) {
				visibleCountry[checkbox.name] = {
					visible: true,
					index: vindex
				};
			}
			vindex++;
		}

		for (const key in countrys) {
			if (!countrys.hasOwnProperty(key)) {
				continue;
			}
			if (!(visibleCountry[key]) || visibleCountry[key].visible === false) {
				continue;
			}
			const country: Context = {
				name: key,
				values: []
			};
			for (const it of countrys[key].daily) {
				const date = strToDate(it.date);
				if (date.getTime() < line_xd[0].getTime() || date.getTime() > line_xd[1].getTime()) {
					continue;
				}
				const data = it.cdr[index];
				if (data > line_yd[1]) {
					line_yd[1] = data;
				}
				country.values.push({
					date: date,
					data: data,
				});
			}
			if (country.values.length > 0) {
				this.linedata.push(country);
			}
		}
		this.line_x.domain(line_xd);
		this.line_y.domain(line_yd);
		this.line_y.nice();
	}
	public addData(raw: WorldSummary): void {
		this.raw = raw;
		dispdata.countrys = [];
		const line_xd = line_xd_default.concat();

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
		const line_yd = this.line_y.domain();
		switch (scale) {
			case "liner":
				this.line_y = d3.scaleLinear();
				line_yd[0] = 0;
				break;
			case "log":
				this.line_y = d3.scaleLog().clamp(true);
				line_yd[0] = 1;
				break;
			default:
				this.line_y = d3.scaleLinear();
				line_yd[0] = 0;
				break;
		}
		this.line_y.range([this.height, 0]);
		this.line_y.domain(line_yd);
		this.line_y.nice();

		this.line_yAxis = d3.axisLeft<number>(this.line_y)
			.tickSizeInner(-this.width)
			.tickFormat(formatNumberConmma)
			.tickPadding(7)
			.ticks(5);
	}
	public draw(): void {
		if (!this.linedata) {
			// undefinedチェック
			return;
		}

		this.line = this.svg.selectAll<SVGGElement, Context>(".line")
			.data(this.linedata)
			.enter()
			.append("g")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.attr("class", "line");

		this.line.append("path")			// 全体グラフ
			.attr("class", "line")
			.style("stroke", this.line_path_stroke)
			.attr("d", this.line_path_d);

		this.line.append("text")			// 国名
			.attr("class", "line")
			.attr("font-size", "12px")
			.attr("x", d => {
				const val = d.values[d.values.length - 1];
				return this.line_x(val.date) - d.name.length * 5;
			})
			.attr("y", d => this.line_y(d.values[d.values.length - 1].data))
			.style("fill", "black")
			.style("stroke", "black")
			.style("stroke-width", "0px")
			.text(d => d.name);

		this.svg.append("g")				// 全体x目盛軸
			.attr("class", "x axis")
			.attr("transform", `translate(${this.margin.left},${this.height + this.margin.top})`)
			.call(this.line_xAxis);

		this.svg.append("g")				// 全体y目盛軸
			.attr("class", "y axis")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.call(this.line_yAxis);
	}
}

class Client {
	private line: LineChart;
	private query: [QueryStr, string][];
	private startdate: string;
	private enddate: string;
	private countrystr: string;
	private countryIndex: { [country in string]: number };

	constructor(hash: string = "") {
		this.countryIndex = {};
		this.countrystr = "";
		this.startdate = "2020/04/01";
		this.enddate = "2020/04/10";
		this.query = [];
		this.setDefaultQuery();
		this.loadHash(hash);
		this.updateHash();
		this.line = new LineChart(svgIDLine);
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
			this.line.addData(value);
			this.change();
			this.initHash();
		}).catch(error => {
			console.error(error);
		});
	}
	public dispose(): void {
		this.line?.dispose();
	}
	public setDefaultQuery(): void {
		this.query = [
			["country", this.countrystr],
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
		this.query[HashIndex["country"]][1].split("|").forEach(it => {
			const country = decodeURI(it);
			if (this.countryIndex[country] !== undefined) {
				dispdata.countrys[this.countryIndex[country]].checked = true;
			}
		})
		dispdata.nowcategory = this.query[HashIndex["category"]][1] as NumberStr;
		dispdata.nowyscale = this.query[HashIndex["yscale"]][1] as YScaleType;
		dispdata.slider.xaxis.value[0] = this.query[HashIndex["startdate"]][1];
		dispdata.slider.xaxis.value[1] = this.query[HashIndex["enddate"]][1];
	}
	public static countryListStr(): string {
		return dispdata.countrys.map(it => it.checked ? encodeURI(it.name) : "").filter(it => it !== "").sort().join("|");
	}
	public dispdataToQuery(): void {
		this.query[HashIndex["country"]][1] = Client.countryListStr();
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
			if (it[0] === "country" && it[1] === this.countrystr) {
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
		}).map(it => it.join("=")).join("&");
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
		this.countryIndex = {};
		let index = 0;
		for (const it of dispdata.countrys) {
			this.countryIndex[it.name] = index;
			index++;
		}
		this.countrystr = Client.countryListStr();
		this.dispdataToQuery();
		this.updateHash();
	}
	public getLineData(): Readonly<Array<Context>> {
		return this.line.getLineData();
	}
	public change(): void {
		this.line.clear();
		this.line.resetYScale(dispdata.nowyscale);
		this.line.changeData(dispdata.nowcategory);
		this.line.draw();
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
	nowyscale: "liner"
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
			query[HashIndex["country"]][1] = Client.countryListStr();
			cli.updateHash(query);
		},
		countryCheckAllClick: () => {
			for (const country of dispdata.countrys) {
				country.checked = true;
			}
			cli.change();
		},
		countryUncheckAllClick: () => {
			for (const country of dispdata.countrys) {
				country.checked = false;
			}
			cli.change();
		},
		countryCheckBest10Click: () => {
			const indexmap: { [key in string]: number } = {};
			let cindex = 0;
			for (const country of dispdata.countrys) {
				country.checked = false;
				indexmap[country.name] = cindex;
				cindex++;
			}
			const datalist = dispdata.countrys.concat();
			const target = NumberIndex[dispdata.nowcategory];
			datalist.sort((a, b) => b.data[target] - a.data[target]);
			const len = Math.min(datalist.length, 10);
			for (let i = 0; i < len; i++) {
				const index = indexmap[datalist[i].name];
				dispdata.countrys[index].checked = true;
			}
			cli.change();
		},
		sliderChange: () => {
			cli.change();
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
