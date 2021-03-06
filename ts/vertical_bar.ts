import * as d3 from 'd3';
import Vue from 'vue';
import VueSlider from 'vue-slider-component';
import * as chart from "./lib/chart";
import * as client from "./lib/client";

type ChartPathData = {
	date: Date;
	data: number;
}

const YScaleType = chart.ScaleStr;
type YScaleType = chart.ScaleStr;
const QueryStr = {
	country: "country",
	category: "category",
	yscale: "yscale",
	startdate: "startdate",
	enddate: "enddate"
} as const;
type QueryStr = typeof QueryStr[keyof typeof QueryStr];

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
			.tickFormat(chart.formatNumberConmma)
			.tickPadding(7)
			.ticks(5);

		this.vbar_color = d3.scaleOrdinal(chart.metroColor);
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
		const len = ((line_xd[1].getTime() - line_xd[0].getTime()) / chart.dayMillisecond) + 1;
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
					checked: true
				});
			}
		}
		// 国と色を固定する
		this.vbar_color.domain(clist);
		dispdata.slider.xaxis.value = [chart.timeFormat(line_xd[0]), chart.timeFormat(line_xd[1])];
		dispdata.slider.xaxis.data = this.createDateRange(line_xd[0], line_xd[1]);
	}
	public resetScale(scale: YScaleType) {
		const line_yd = this.vbar_y.domain();
		switch (scale) {
			case YScaleType.liner:
				this.vbar_y = d3.scaleLinear();
				line_yd[0] = 0;
				break;
			case YScaleType.log:
				this.vbar_y = d3.scaleLog().clamp(true);
				line_yd[0] = 1;
				break;
			default:
				const _exhaustiveCheck: never = scale;
				break;
		}
		this.vbar_y.range([this.height, 0]);
		this.vbar_y.domain(line_yd);
		this.vbar_y.nice();
		this.vbar_yAxis.scale(this.vbar_y);
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
		this.run(query);
	}
	public createDefaultQuery(): client.Query<QueryStr> {
		const q = new client.Query<QueryStr>();
		q.set(QueryStr.country, chart.countryDefault);
		q.set(QueryStr.category, chart.categoryDefault);
		q.set(QueryStr.yscale, chart.scaleDefault);
		q.set(QueryStr.startdate, this.startdate);
		q.set(QueryStr.enddate, this.enddate);
		return q;
	}
	public loadQuery(query: string): void {
		if (!query) {
			query = location.search;
		}
		this.query = this.createDefaultQuery();
		this.query.loadSearchParams(query);
		dispdata.nowcountry = chart.base64encode(this.query.get(QueryStr.country));
		dispdata.nowcategory = this.query.get(QueryStr.category) as chart.NumberStr;
		dispdata.nowyscale = this.query.get(QueryStr.yscale) as YScaleType;
		dispdata.slider.xaxis.value = [
			this.query.get(QueryStr.startdate),
			this.query.get(QueryStr.enddate)
		];
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
		{ id: chart.NumberStr.confirmed, name: "感染数" },
		{ id: chart.NumberStr.deaths, name: "死亡数" },
		{ id: chart.NumberStr.recovered, name: "回復数" }
	],
	yscales: [
		{ id: YScaleType.liner, name: "線形" },
		{ id: YScaleType.log, name: "対数" },
	],
	countrys: [],
	slider: {
		xaxis: {
			value: [chart.datestrDefault, chart.datestrDefault],
			data: [chart.datestrDefault]
		}
	},
	nowcategory: chart.categoryDefault,
	nowyscale: chart.scaleDefault,
	nowcountry: chart.base64encode(chart.countryDefault)
};
const vm = new Vue({
	el: "#container",
	data: dispdata,
	components: {
		'VueSlider': VueSlider,
	},
	computed: {
		nowcountrystr: () => chart.base64decode(dispdata.nowcountry),
		startdate: () => chart.formatDateStr(dispdata.slider.xaxis.value[0]),
		enddate: () => chart.formatDateStr(dispdata.slider.xaxis.value[1]),
		lastdate: () => chart.formatDateStr(dispdata.slider.xaxis.data[dispdata.slider.xaxis.data.length - 1])
	},
	methods: {
		categoryChange: () => cli.update([[QueryStr.category, dispdata.nowcategory]]),
		yscaleChange: () => cli.update([[QueryStr.yscale, dispdata.nowyscale]]),
		countryChange: () => cli.update([[QueryStr.country, chart.base64decode(dispdata.nowcountry)]]),
		sliderChange: () => cli.update([[QueryStr.startdate, dispdata.slider.xaxis.value[0]], [QueryStr.enddate, dispdata.slider.xaxis.value[1]]])
	}
});
const cli = new Client(location.search);
