import * as d3 from 'd3';
import Vue from 'vue';

type Box = {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

type DatasetSimple = {
	date: string,
	cdr: [number, number, number]
}
type CountrySummary = {
	daily: DatasetSimple[],
	cdr: [number, number, number]
}
type WorldSummary = {
	countrys: { [key in string]: CountrySummary },
	cdr: [number, number, number]
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
const line_xd_default: [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
const line_yd_default: [number, number] = [0, 0];

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
	private linedata?: Array<Context>;
	private raw?: WorldSummary;
	private target: NumberStr;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1560;
		this.width = this.width - this.margin.left - this.margin.right;
		this.height = 720 - this.margin.top - this.margin.bottom;
		this.target = "confirmed";

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
	public changeData(target: NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.target = target;
		this.linedata = [];

		const index = NumberIndex[target];
		const countrys = this.raw.countrys;
		const atoi = (str: string): number => parseInt(str, 10);
		const line_xd = line_xd_default.concat();
		const line_yd = this.line_y.domain();
		line_yd[1] = line_yd_default[1];
		for (const key in countrys) {
			if (!countrys.hasOwnProperty(key)) {
				continue;
			}
			const country: Context = {
				name: key,
				values: []
			};
			for (const it of countrys[key].daily) {
				const datearray = it.date.split("/").map<number>(atoi);
				// 月は-1しないと期待通りに動作しない
				const date = new Date(datearray[0], datearray[1] - 1, datearray[2]);
				const data = it.cdr[index];
				if (date.getTime() < line_xd[0].getTime()) {
					line_xd[0] = date;
				}
				if (date.getTime() > line_xd[1].getTime()) {
					line_xd[1] = date;
				}
				if (data > line_yd[1]) {
					line_yd[1] = data;
				}
				country.values.push({
					date: date,
					data: data,
				});
			}
			this.linedata.push(country);
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
		this.changeData(this.target);
	}
	public resetYScale(scale: YScaleType) {
		const line_yd = this.line_y.domain();
		switch (scale) {
			case "Liner":
				this.line_y = d3.scaleLinear();
				line_yd[0] = 0;
				break;
			case "Log":
				this.line_y = d3.scaleLog();
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
			this.line.draw();
		}).catch(error => {
			console.error(error);
		});
	}
	public dispose(): void {
		this.line?.dispose();
	}
	public changeCategory(cate: NumberStr): void {
		this.line.clear();
		this.line.changeData(cate);
		this.line.draw();
	}
	public changeYScale(scale: YScaleType): void {
		this.line.clear();
		this.line.resetYScale(scale);
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
	nowcategory: "confirmed",
	nowyscale: "Liner"
};
const vm = new Vue({
	el: "#container",
	data: dispdata,
	methods: {
		categoryChange: () => {
			cli.changeCategory(dispdata.nowcategory);
		},
		yscaleChange: () => {
			cli.changeYScale(dispdata.nowyscale);
		}
	}
});
const cli = new Client();
cli.run();