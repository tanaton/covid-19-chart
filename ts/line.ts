import * as d3 from 'd3';
import Vue from 'vue';

type Display = {
	confirmed_now: number;
	deaths_now: number;
	recovered_now: number;
}

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
const NumberIndex: { readonly [key in NumberStr]: number } = {
	confirmed: 0,
	deaths: 1,
	recovered: 2,
};
const svgIDLine = "svgline";
const lineUrl = "/data/daily_reports/summary.json";
const timeFormat = d3.timeFormat("%Y/%m/%d");

class LineChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private line?: d3.Selection<SVGGElement, Context, SVGSVGElement, unknown>;
	private line_x: d3.ScaleTime<number, number>;
	private line_y: d3.ScaleLinear<number, number>;
	private line_xAxis: d3.Axis<Date>;
	private line_yAxis: d3.Axis<number | { valueOf(): number; }>;
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
			.domain([new Date(2099, 12, 31), new Date(2001, 1, 1)])
			.range([0, this.width]);
		this.line_y = d3.scaleLinear()
			.domain([8_000_000_000, -8_000_000_000])
			.range([this.height, 0]);
		this.line_xAxis = d3.axisBottom<Date>(this.line_x)
			.tickSizeInner(-this.height)
			.tickFormat(timeFormat)
			.tickPadding(7)
			.ticks(5);
		this.line_yAxis = d3.axisLeft(this.line_y)
			.tickSizeInner(-this.width)
			.tickPadding(7);
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
	private clear(): void {
		this.svg.selectAll("g").remove();
	}
	private changeData(target: NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.target = target;
		this.linedata = [];

		const index = NumberIndex[target];
		const countrys = this.raw.countrys;
		const atoi = (str: string): number => parseInt(str, 10);
		const line_xd = this.line_x.domain();
		const line_yd = this.line_y.domain();
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
				if (data < line_yd[0]) {
					line_yd[0] = data;
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
		this.line_y.domain(line_yd).nice();

		dispdata.confirmed_now = this.raw.cdr[0];
		dispdata.deaths_now = this.raw.cdr[1];
		dispdata.recovered_now = this.raw.cdr[2];
	}
	public addData(raw: WorldSummary): void {
		this.raw = raw;
		this.changeData("confirmed");
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

		this.svg.append("g")				// 全体x目盛軸
			.attr("class", "x axis")
			.attr("transform", `translate(0,${this.height})`)
			.call(this.line_xAxis);

		this.svg.append("g")				// 全体y目盛軸
			.attr("class", "y axis")
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
	recovered_now: 0
};
const vm = new Vue({
	el: "#container",
	data: dispdata
});
const cli = new Client();
cli.run();