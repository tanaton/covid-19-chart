import * as d3 from 'd3';
import Vue from 'vue';
import VueSlider from 'vue-slider-component';
import * as chart from "./lib/chart";
import * as client from "./lib/client";

type ChartPathData = {
	date: Date;
	data: number;
}

type Context = {
	readonly name: string;
	values: ChartPathData[];
}

type YScaleType = chart.ScaleStr;
type QueryStr = "country" | "category" | "yscale" | "startdate" | "enddate";

type Display = {
	categorys: Array<{ id: chart.NumberStr, name: string }>;
	yscales: Array<{ id: YScaleType, name: string }>;
	countrys: Array<{
		id: string,
		name: string,
		data: chart.CDR,
		checked: boolean
	}>;
	slider: {
		xaxis: {
			value: string[];
			data: string[];
		};
	};
	nowcategory: chart.NumberStr;
	nowyscale: YScaleType;
}

const svgIDLine = "svgline";
const line_xd_default: readonly [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
const line_yd_default: readonly [number, number] = [0, 0];

class LineChart extends chart.BaseChart<YScaleType> implements chart.IChart<YScaleType> {
	private line?: d3.Selection<SVGGElement, Context, SVGSVGElement, unknown>;
	private line_x: d3.ScaleTime<number, number>;
	private line_y: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private line_xAxis: d3.Axis<Date>;
	private line_yAxis: d3.Axis<number>;
	private line_line: d3.Line<ChartPathData>;
	private line_path_d: (d: Context) => string | null;
	private line_color: d3.ScaleOrdinal<string, string>;
	private line_path_stroke: (d: { name: string }) => string;

	private linedata: Array<Context>;
	private raw?: chart.WorldSummary;

	constructor(svgid: string) {
		super(svgid);
		this.linedata = [];

		this.line_x = d3.scaleTime()
			.domain(line_xd_default.concat())
			.range([0, this.width]);
		this.line_y = d3.scaleLinear()
			.domain(line_yd_default.concat())
			.range([this.height, 0]);
		this.line_xAxis = d3.axisBottom<Date>(this.line_x)
			.tickSizeInner(-this.height)
			.tickFormat(chart.timeFormat)
			.tickPadding(7)
			.ticks(5);
		this.line_yAxis = d3.axisLeft<number>(this.line_y)
			.tickSizeInner(-this.width)
			.tickFormat(chart.formatNumberConmma)
			.tickPadding(7)
			.ticks(5);
		this.line_line = d3.line<ChartPathData>()
			.curve(d3.curveLinear)
			//.curve(d3.curveMonotoneX)
			//.curve(d3.curveStepAfter)
			.x(d => this.line_x(d.date))
			.y(d => this.line_y(d.data));
		this.line_path_d = d => this.line_line(d.values);

		this.line_color = d3.scaleOrdinal(chart.metroColor);
		this.line_path_stroke = d => this.line_color(d.name);
	}
	public changeData(target: chart.NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.linedata = [];

		const index = chart.NumberIndex[target];
		const countrys = this.raw.countrys;
		const line_yd = this.line_y.domain();
		const line_xd = [
			chart.strToDate(dispdata.slider.xaxis.value[0]),
			chart.strToDate(dispdata.slider.xaxis.value[1])
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
				const date = chart.strToDate(it.date);
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
	public addData(raw: chart.WorldSummary): void {
		this.raw = raw;
		dispdata.countrys = [];
		const line_xd = line_xd_default.concat();
		const clist: string[] = [];

		for (const key in raw.countrys) {
			if (!raw.countrys.hasOwnProperty(key)) {
				continue;
			}
			clist.push(key);
			const daily = raw.countrys[key].daily;
			if (daily && daily.length > 0) {
				const start = chart.strToDate(daily[0].date);
				const last = daily[daily.length - 1];
				const end = chart.strToDate(last.date);
				if (start.getTime() < line_xd[0].getTime()) {
					line_xd[0] = start;
				}
				if (end.getTime() > line_xd[1].getTime()) {
					line_xd[1] = end;
				}
				const cdr = last.cdr;
				dispdata.countrys.push({
					id: chart.base64encode(key), // カンマとかスペースとかを適当な文字にする
					name: key,
					data: [cdr[0], cdr[1], cdr[2]],
					checked: false
				});
			}
		}
		// 国と色を固定する
		this.line_color.domain(clist);
		dispdata.slider.xaxis.value = [chart.timeFormat(line_xd[0]), chart.timeFormat(line_xd[1])];
		dispdata.slider.xaxis.data = this.createDateRange(line_xd[0], line_xd[1]);
	}
	public resetScale(scale: YScaleType): void {
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
				const _exhaustiveCheck: never = scale;
				break;
		}
		this.line_y.range([this.height, 0]);
		this.line_y.domain(line_yd);
		this.line_y.nice();
		this.line_yAxis.scale(this.line_y);
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

class Client extends client.BaseClient<QueryStr, YScaleType> implements client.IClient<QueryStr> {
	private startdate: string;
	private enddate: string;
	private countrystr: string;
	private countryIndex: { [country in string]: number };

	constructor(query: string = "") {
		super(new LineChart(svgIDLine));
		this.countryIndex = {};
		this.countrystr = "";
		this.startdate = "20200401";
		this.enddate = "20200410";
		this.run(query);
	}
	public createDefaultQuery(): client.Query<QueryStr> {
		const q = new client.Query<QueryStr>();
		q.set("country", this.countrystr);
		q.set("category", chart.categoryDefault);
		q.set("yscale", chart.scaleDefault);
		q.set("startdate", this.startdate);
		q.set("enddate", this.enddate);
		return q;
	}
	public loadQuery(query: string): void {
		if (!query) {
			query = location.search;
		}
		this.query = this.createDefaultQuery();
		this.query.loadSearchParams(query);
		this.query.get("country").split("|").forEach(it => {
			const country = decodeURI(it);
			if (this.countryIndex[country] !== undefined) {
				dispdata.countrys[this.countryIndex[country]].checked = true;
			}
		})
		dispdata.nowcategory = this.query.get("category") as chart.NumberStr;
		dispdata.nowyscale = this.query.get("yscale") as YScaleType;
		dispdata.slider.xaxis.value = [
			this.query.get("startdate"),
			this.query.get("enddate")
		];
	}
	public static countryListStr(): string {
		return dispdata.countrys.filter(it => it.checked).map(it => it.name).sort().join("|");
	}
	public initQuery(query: string = ""): void {
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
		this.countrystr = dispdata.countrys.map(it => it.name).sort().join("|");
		this.loadQuery(query);
		this.updateQuery();
	}
	public change(): void {
		this.chart.clear();
		this.chart.resetScale(dispdata.nowyscale);
		this.chart.changeData(dispdata.nowcategory);
		this.chart.draw();
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
	nowcategory: chart.categoryDefault,
	nowyscale: chart.scaleDefault
};
const vm = new Vue({
	el: "#container",
	data: dispdata,
	components: {
		'VueSlider': VueSlider,
	},
	methods: {
		categoryChange: () => cli.update([["category", dispdata.nowcategory]]),
		yscaleChange: () => cli.update([["yscale", dispdata.nowyscale]]),
		countryChange: () => cli.update([["country", Client.countryListStr()]]),
		countryCheckAllClick: () => {
			for (const country of dispdata.countrys) {
				country.checked = true;
			}
			cli.update([["country", Client.countryListStr()]]);
		},
		countryUncheckAllClick: () => {
			for (const country of dispdata.countrys) {
				country.checked = false;
			}
			cli.update([["country", ""]]);
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
			const target = chart.NumberIndex[dispdata.nowcategory];
			datalist.sort((a, b) => b.data[target] - a.data[target]);
			const len = Math.min(datalist.length, 10);
			for (let i = 0; i < len; i++) {
				const index = indexmap[datalist[i].name];
				dispdata.countrys[index].checked = true;
			}
			cli.update([["country", Client.countryListStr()]]);
		},
		sliderChange: () => cli.update([["startdate", dispdata.slider.xaxis.value[0]], ["enddate", dispdata.slider.xaxis.value[1]]])
	}
});
const cli = new Client(location.search);
