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
type YScaleType = "Liner" | "Log";

type Display = {
	confirmed_now: number;
	deaths_now: number;
	recovered_now: number;
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
const svgIDLine = "svgline";
const lineUrl = "/data/daily_reports/summary.json";
const timeFormat = d3.timeFormat("%Y/%m/%d");
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
	private target: NumberStr;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 8000;
		this.width = this.width - this.margin.left - this.margin.right;
		this.height = 720 - this.margin.top - this.margin.bottom;
		this.target = "confirmed";
		this.linedata = [];

		this.svg = d3.select("#" + this.svgid).append("svg");
		this.svg
			.attr("width", this.width + this.margin.left + this.margin.right + 10)
			.attr("height", this.height + this.margin.top + this.margin.bottom + 10);

		this.line_x = d3.scaleTime()
			.domain(line_xd_default.concat())
			.range([0, this.width]);
		//this.line_y = d3.scaleLog()
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
		this.target = target;
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

		dispdata.confirmed_now = this.raw.cdr[0];
		dispdata.deaths_now = this.raw.cdr[1];
		dispdata.recovered_now = this.raw.cdr[2];
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
			case "Liner":
				this.line_y = d3.scaleLinear();
				line_yd[0] = 0;
				break;
			case "Log":
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
			.attr("x", d => this.line_x(d.values[d.values.length - 1].date) - 30)
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

	constructor() {
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
		httpget(lineUrl).then(value => {
			this.line.addData(value);
			this.changeCategory("confirmed");
		}).catch(error => {
			console.error(error);
		});
	}
	public dispose(): void {
		this.line?.dispose();
	}
	public getLineData(): Readonly<Array<Context>> {
		return this.line.getLineData();
	}
	public changeCategory(cate: NumberStr): void {
		this.line.clear();
		this.line.changeData(cate);
		this.line.draw();
	}
	public changeYScale(scale: YScaleType): void {
		this.line.clear();
		this.line.resetYScale(scale);
		this.line.changeData(dispdata.nowcategory);
		this.line.draw();
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
	confirmed_now: 0,
	deaths_now: 0,
	recovered_now: 0,
	categorys: [
		{ id: "confirmed", name: "感染数" },
		{ id: "deaths", name: "死亡数" },
		{ id: "recovered", name: "回復数" }
	],
	yscales: [
		{ id: "Liner", name: "Y軸線形" },
		{ id: "Log", name: "Y軸対数" },
	],
	countrys: [],
	slider: {
		xaxis: {
			value: [],
			data: []
		}
	},
	nowcategory: "confirmed",
	nowyscale: "Liner"
};
const vm = new Vue({
	el: "#container",
	data: dispdata,
	components: {
		'VueSlider': VueSlider,
	},
	methods: {
		categoryChange: () => {
			cli.changeCategory(dispdata.nowcategory);
		},
		yscaleChange: () => {
			cli.changeYScale(dispdata.nowyscale);
		},
		countryChange: () => {
			cli.changeCategory(dispdata.nowcategory);
		},
		countryCheckAllClick: () => {
			for (const country of dispdata.countrys) {
				country.checked = true;
			}
			cli.changeCategory(dispdata.nowcategory);
		},
		countryUncheckAllClick: () => {
			for (const country of dispdata.countrys) {
				country.checked = false;
			}
			cli.changeCategory(dispdata.nowcategory);
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
			cli.changeCategory(dispdata.nowcategory);
		},
		sliderChange: () => {
			cli.changeCategory(dispdata.nowcategory);
		}
	}
});
const cli = new Client();
cli.run();