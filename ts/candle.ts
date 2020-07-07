import * as d3 from 'd3';
import Vue from 'vue';
import VueSlider from 'vue-slider-component';
import * as chart from "./lib/chart";
import * as client from "./lib/client";

type ChartPathData = {
	date: Date;
	start: Date;
	end: Date;
	open: number;
	close: number;
	high: number;
	low: number;
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
		id: string;
		name: string;
		data: chart.CDR;
		checked: boolean;
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

const svgIDcandle = "svgcandle";
const candle_xd_default: readonly [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
const candle_yd_default: readonly [number, number] = [0, 0];

class CandleChart extends chart.BaseChart<YScaleType> implements chart.IChart<YScaleType> {
	private candle?: d3.Selection<SVGGElement, ChartPathData, SVGSVGElement, unknown>;
	private candle_x: d3.ScaleTime<number, number>;
	private candle_yLiner: d3.ScaleLinear<number, number>;
	private candle_yLog: d3.ScaleLogarithmic<number, number>;
	private candle_y: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private candle_xAxis: d3.Axis<Date>;
	private candle_yAxis: d3.Axis<number>;
	private candle_color: d3.ScaleOrdinal<string, string>;
	private candle_rect_stroke: (d: ChartPathData, i: number) => string;

	private candledata: ChartPathData[];
	private raw?: chart.WorldSummary;
	private candlewidth: number;

	constructor(svgid: string) {
		super(svgid);
		this.candledata = [];
		this.candlewidth = 10;

		this.candle_x = d3.scaleTime()
			.domain(candle_xd_default.concat())
			.range([0, this.width]);
		this.candle_xAxis = d3.axisBottom<Date>(this.candle_x)
			.tickSizeInner(-this.height)
			.tickFormat(chart.timeFormat)
			.tickPadding(7)
			.ticks(5);
		this.candle_yLiner = d3.scaleLinear();
		this.candle_yLog = d3.scaleLog().clamp(true);
		this.candle_y = this.candle_yLiner;
		this.candle_yAxis = d3.axisLeft<number>(this.candle_yLiner)
			.tickSizeInner(-this.width)
			.tickFormat(chart.formatNumberConmma)
			.tickPadding(7)
			.ticks(5);
		this.resetScale(dispdata.nowyscale);

		this.candle_color = d3.scaleOrdinal<string>().range(["#b94047", "#47ba41", "#4147ba", "#bab441", "#41bab4", "#b441ba"]);
		this.candle_color.domain(["red", "green", "blue"]);
		this.candle_rect_stroke = d => (d.open > d.close) ? this.candle_color("red") : this.candle_color("green");
	}
	public changeData(target: chart.NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.candledata = [];

		const index = chart.NumberIndex[target];
		const countrys = this.raw.countrys;
		const line_yd = this.candle_y.domain();
		const line_xd = [
			chart.strToDate(dispdata.slider.xaxis.value[0]),
			chart.strToDate(dispdata.slider.xaxis.value[1])
		];
		line_yd[1] = candle_yd_default[1];

		const key = chart.base64decode(dispdata.nowcountry);
		if (countrys.hasOwnProperty(key)) {
			let yesterday = 0;
			let footstart: Date | undefined;
			let date: Date | undefined;
			let open = 0;
			let close = 0;
			let high = 0;
			let low = 0;
			for (const it of countrys[key].daily) {
				date = chart.strToDate(it.date);
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
						date: new Date(date.getTime() - chart.dayMillisecond * 3.5),
						start: new Date(date.getTime() - chart.dayMillisecond * 7),
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
				const start = new Date(date.getTime() - chart.dayMillisecond * monday);
				this.candledata.push({
					date: new Date(start.getTime() + chart.dayMillisecond * 3.5),
					start: start,
					end: date,
					open: open,
					close: close,
					high: high,
					low: low
				});
			}
			dispdata.confirmed_now = chart.formatNumberConmma(countrys[key].cdr[0]);
			dispdata.deaths_now = chart.formatNumberConmma(countrys[key].cdr[1]);
			dispdata.recovered_now = chart.formatNumberConmma(countrys[key].cdr[2]);
		}

		if (this.candledata && this.candledata.length > 0) {
			const start = line_xd[0].getTime();
			const end = line_xd[1].getTime();
			this.candlewidth = Math.max(Math.floor((this.width / Math.max((end - start) / (chart.dayMillisecond * 7), 1)) * 0.95), 3);
		} else {
			this.candlewidth = 10;
		}
		this.candle_x.domain(line_xd);
		this.candle_y.domain(line_yd);
		this.candle_y.nice();

		dispdata.slider.xaxis.value[0] = chart.timeFormat(line_xd[0]);
		dispdata.slider.xaxis.value[1] = chart.timeFormat(line_xd[1]);
	}
	public addData(raw: chart.WorldSummary): void {
		this.raw = raw;
		dispdata.countrys = [];
		const line_xd = candle_xd_default.concat();

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
		dispdata.slider.xaxis.data = this.createDateRange(line_xd[0], line_xd[1]);
	}
	public resetScale(scale: YScaleType) {
		const line_yd = this.candle_y.domain();
		switch (scale) {
			case YScaleType.liner:
				this.candle_y = this.candle_yLiner;
				line_yd[0] = 0;
				break;
			case YScaleType.log:
				this.candle_y = this.candle_yLog;
				line_yd[0] = 1;
				break;
			default:
				const _exhaustiveCheck: never = scale;
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
			.text(d => `date:${chart.timeFormat(d.start)}-${chart.timeFormat(d.end)}\nopen:${d.open}\nclose:${d.close}\nhigh:${d.high}\nlow:${d.low}`);

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

class Client extends client.BaseClient<QueryStr, YScaleType> implements client.IClient<QueryStr> {
	private startdate: string;
	private enddate: string;

	constructor(query: string = "") {
		super(new CandleChart(svgIDcandle));
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
		dispdata.nowcountry = chart.base64encode(this.query.get("country"));
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
let cli = new Client(location.search);
