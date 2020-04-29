import * as d3 from 'd3';
import Vue from 'vue';
import VueSlider from 'vue-slider-component';
import * as chart from "./lib/chart";
import * as client from "./lib/client";

type ChartPathData = {
	date: Date;
	data: number;
}

type YScaleType = "liner" | "log";
type QueryStr = "country" | "category" | "yscale" | "startdate" | "enddate";

type Display = {
	confirmed_now: string;
	deaths_now: string;
	recovered_now: string;
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
	nowcountry: string;
}

const QueryIndex: { readonly [key in QueryStr]: number } = {
	country: 0,
	category: 1,
	yscale: 2,
	startdate: 3,
	enddate: 4
};
const svgIDvbar = "svgvbar";
const vbar_xd_default: readonly [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
const vbar_yd_default: readonly [number, number] = [0, 0];

class VerticalBarChart extends chart.BaseChart<YScaleType> implements chart.IChart<YScaleType> {
	private vbar?: d3.Selection<SVGGElement, ChartPathData, SVGSVGElement, unknown>;
	private vbar_x: d3.ScaleTime<number, number>;
	private vbar_y: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private vbar_xAxis: d3.Axis<Date>;
	private vbar_yAxis: d3.Axis<number>;
	private vbar_color: d3.ScaleOrdinal<string, string>;

	private vbardata: ChartPathData[];
	private barwidth: number;
	private raw?: chart.WorldSummary;

	constructor(svgid: string) {
		super(svgid);
		this.vbardata = [];
		this.barwidth = 10;

		this.vbar_x = d3.scaleTime()
			.domain(vbar_xd_default.concat())
			.range([0, this.width]);
		this.vbar_y = d3.scaleLinear()
			.domain(vbar_yd_default.concat())
			.range([this.height, 0]);
		this.vbar_xAxis = d3.axisBottom<Date>(this.vbar_x)
			.tickSizeInner(-this.height)
			.tickFormat(chart.timeFormat)
			.tickPadding(7)
			.ticks(5);
		this.vbar_yAxis = d3.axisLeft<number>(this.vbar_y)
			.tickSizeInner(-this.width)
			.tickPadding(7)
			.ticks(5);

		this.vbar_color = d3.scaleOrdinal(d3.schemeCategory10);
	}
	public changeData(target: chart.NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.vbardata = [];

		const index = chart.NumberIndex[target];
		const countrys = this.raw.countrys;
		const line_yd = this.vbar_y.domain();
		const line_xd = [
			chart.strToDate(dispdata.slider.xaxis.value[0]),
			chart.strToDate(dispdata.slider.xaxis.value[1])
		];
		line_yd[1] = vbar_yd_default[1];

		const key = chart.base64decode(dispdata.nowcountry);
		if (countrys.hasOwnProperty(key)) {
			let yesterday = 0;
			for (const it of countrys[key].daily) {
				const data = Math.max(it.cdr[index] - yesterday, 0);
				yesterday = it.cdr[index];
				const date = chart.strToDate(it.date);
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
			dispdata.confirmed_now = chart.formatNumberConmma(countrys[key].cdr[0]);
			dispdata.deaths_now = chart.formatNumberConmma(countrys[key].cdr[1]);
			dispdata.recovered_now = chart.formatNumberConmma(countrys[key].cdr[2]);
		}
		const len = ((line_xd[1].getTime() - line_xd[0].getTime()) / (3600 * 24 * 1000)) + 1;
		this.barwidth = Math.floor(this.width / len);
		this.vbar_x.domain(line_xd);
		this.vbar_y.domain(line_yd);
		this.vbar_y.nice();

		dispdata.slider.xaxis.value[0] = chart.timeFormat(line_xd[0]);
		dispdata.slider.xaxis.value[1] = chart.timeFormat(line_xd[1]);
	}
	public addData(raw: chart.WorldSummary): void {
		this.raw = raw;
		dispdata.countrys = [];
		const line_xd = vbar_xd_default.concat();

		for (const key in raw.countrys) {
			if (!raw.countrys.hasOwnProperty(key)) {
				continue;
			}
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
					checked: true
				});
			}
		}
		dispdata.slider.xaxis.value = [chart.timeFormat(line_xd[0]), chart.timeFormat(line_xd[1])];
		let date: Date = new Date(line_xd[0].getTime());
		while (date <= line_xd[1]) {
			dispdata.slider.xaxis.data.push(chart.timeFormat(date));
			date = new Date(date.getTime() + 60 * 60 * 24 * 1000);
		}
	}
	public resetScale(scale: YScaleType) {
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
			.tickFormat(chart.formatNumberConmma)
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
			.style("fill", this.vbar_color(chart.base64decode(dispdata.nowcountry)))
			.attr("x", d => this.vbar_x(d.date) - (this.barwidth / 2))
			.attr("y", d => this.vbar_y(d.data))
			.attr("width", this.barwidth)
			.attr("height", d => Math.abs(this.vbar_y(0) - this.vbar_y(d.data)));

		this.vbar.append("title")
			.text(d => `date:${chart.timeFormat(d.date)}\ndata:${chart.formatNumberConmma(d.data)}`);

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

class Client extends client.BaseClient<QueryStr, YScaleType> implements client.IClient<QueryStr> {
	private startdate: string;
	private enddate: string;

	constructor(query: string = "") {
		super(new VerticalBarChart(svgIDvbar));
		this.startdate = "20200401";
		this.enddate = "20200410";
		this.setDefaultQuery();
		this.run(query);
	}
	public setDefaultQuery(): void {
		this.query = [
			["country", chart.base64decode(dispdata.nowcountry)],
			["category", dispdata.nowcategory],
			["yscale", dispdata.nowyscale],
			["startdate", this.startdate],
			["enddate", this.enddate],
		];
	}
	public loadQuery(query: string): void {
		if (!query) {
			query = location.search;
		}
		this.setDefaultQuery();
		const url = new URLSearchParams(query);
		for (const [key, value] of url) {
			const qs = key as QueryStr;
			this.query[QueryIndex[qs]] = [qs, value];
		}
		dispdata.nowcountry = chart.base64encode(this.query[QueryIndex["country"]][1]);
		dispdata.nowcategory = this.query[QueryIndex["category"]][1] as chart.NumberStr;
		dispdata.nowyscale = this.query[QueryIndex["yscale"]][1] as YScaleType;
		dispdata.slider.xaxis.value = [
			this.query[QueryIndex["startdate"]][1],
			this.query[QueryIndex["enddate"]][1]
		];
	}
	public createQuery(querylist?: [QueryStr, string][]): string {
		if (!querylist) {
			querylist = this.query;
		}
		const q = querylist.filter(it => {
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
		});
		const url = new URLSearchParams();
		for (const it of q) {
			url.append(it[0], it[1]);
		}
		const query = url.toString();
		return query !== "" ? "?" + query : "";
	}
	public initQuery(query: string = ""): void {
		const data = dispdata.slider.xaxis.data;
		if (data.length >= 2) {
			this.startdate = data[0];
			this.enddate = data[data.length - 1];
		}
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
	nowcountry: chart.base64encode("Japan")
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
			query[QueryIndex["category"]][1] = dispdata.nowcategory;
			cli.updateQuery(query);
		},
		yscaleChange: () => {
			const query = cli.getQuery();
			query[QueryIndex["yscale"]][1] = dispdata.nowyscale;
			cli.updateQuery(query);
		},
		countryChange: () => {
			const query = cli.getQuery();
			query[QueryIndex["country"]][1] = chart.base64decode(dispdata.nowcountry);
			cli.updateQuery(query);
		},
		sliderChange: () => {
			const query = cli.getQuery();
			query[QueryIndex["startdate"]][1] = dispdata.slider.xaxis.value[0];
			query[QueryIndex["enddate"]][1] = dispdata.slider.xaxis.value[1];
			cli.updateQuery(query);
		}
	},
	computed: {
		nowcountrystr: () => chart.base64decode(dispdata.nowcountry)
	}
});
const cli = new Client(location.search);
