import * as d3 from 'd3';
import Vue from 'vue';
import VueSlider from 'vue-slider-component';
import * as chart from "./lib/chart";
import * as client from "./lib/client";

type ChartPathData = {
	name: string;
	data: number;
}

type ChartDataCountry = {
	name: string;
	cdr: chart.CDR;
}

type ChartDataCountrys = {
	[key in string]: {
		date: Date,
		values: ChartDataCountry[];
	}
}

type XScaleType = chart.ScaleStr;
type QueryStr = "category" | "rank" | "xscale" | "date";
type RankStr = "10" | "30" | "50" | "100";

type Display = {
	categorys: Array<{ id: chart.NumberStr, name: string }>;
	xscales: Array<{ id: XScaleType, name: string }>;
	slider: {
		date: {
			value: string;
			data: string[];
		};
	};
	ranks: Array<{ id: string, name: string, value: RankStr }>;
	nowcategory: chart.NumberStr;
	nowxscale: XScaleType;
	nowrank: RankStr;
}

const svgIDhbar = "svghbar";
const line_xd_default: readonly [number, number] = [0, 0];
const line_yd_default: readonly [number, number] = [0, 0];

class HorizontalBarChart extends chart.BaseChart<XScaleType> implements chart.IChart<XScaleType> {
	private hbar?: d3.Selection<SVGGElement, ChartPathData, SVGSVGElement, unknown>;
	private hbar_x: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private hbar_y: d3.ScaleLinear<number, number> | d3.ScaleLogarithmic<number, number>;
	private hbar_xAxis: d3.Axis<number>;
	private hbar_yAxis: d3.Axis<number>;
	private hbar_color: d3.ScaleOrdinal<string, string>;

	private hbardata: Array<ChartPathData>;
	private data: ChartDataCountrys;
	private nowdatestr: string;
	private raw?: chart.WorldSummary;
	private barheight: number;
	private rank: number;

	constructor(svgid: string) {
		super(svgid);
		this.hbardata = [];
		this.data = {};
		this.nowdatestr = "20200401";
		this.barheight = 10;
		this.rank = 30;

		this.hbar_x = d3.scaleLinear()
			.domain(line_xd_default.concat())
			.range([0, this.width]);
		this.hbar_y = d3.scaleLinear()
			.domain(line_yd_default.concat())
			.range([this.height, 0]);
		this.hbar_xAxis = d3.axisBottom<number>(this.hbar_x)
			.tickSizeInner(-this.height)
			.tickFormat(chart.formatNumberConmma)
			.tickPadding(7)
			.ticks(5);
		this.hbar_yAxis = d3.axisLeft<number>(this.hbar_y)
			.tickSizeInner(-this.width)
			.tickPadding(7)
			.ticks(5);

		this.hbar_color = d3.scaleOrdinal(chart.metroColor);
	}
	public changeData(target: chart.NumberStr): void {
		if (!this.raw) {
			return;
		}
		this.hbardata = [];

		const index = chart.NumberIndex[target];
		const datestr = dispdata.slider.date.value;
		const data = (this.data[datestr] !== undefined) ? this.data[datestr] : this.data[this.nowdatestr];
		const xd = [8_000_000_000, -8_000_000_000];

		data.values.sort((a, b) => b.cdr[index] - a.cdr[index]);
		this.rank = chart.atoi(dispdata.nowrank);
		const len = Math.min(data.values.length, this.rank);
		for (let i = 0; i < len; i++) {
			const it = data.values[i];
			const d = it.cdr[index];
			if (d < xd[0]) {
				xd[0] = d;
			}
			if (d > xd[1]) {
				xd[1] = d;
			}
			this.hbardata.push({
				name: it.name,
				data: d
			})
		}
		this.barheight = this.height / (this.hbardata.length ?? 1);
		this.hbar_x.domain(xd);
		this.hbar_x.nice();
		this.hbar_y.domain([len, 0]);
	}
	public addData(raw: chart.WorldSummary): void {
		this.raw = raw;
		this.data = {};
		const daterange: [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
		const clist: string[] = [];

		for (const key in raw.countrys) {
			if (!raw.countrys.hasOwnProperty(key)) {
				continue;
			}
			const daily = raw.countrys[key].daily;
			if (!daily || daily.length <= 0) {
				continue;
			}
			clist.push(key);
			const start = chart.strToDate(daily[0].date);
			const last = daily[daily.length - 1];
			const end = chart.strToDate(last.date);
			if (start.getTime() < daterange[0].getTime()) {
				daterange[0] = start;
			}
			if (end.getTime() > daterange[1].getTime()) {
				daterange[1] = end;
			}
			for (const day of daily) {
				const date = chart.strToDate(day.date);
				if (this.data[day.date] === undefined) {
					this.data[day.date] = {
						date: date,
						values: []
					}
				}
				this.data[day.date].values.push({
					name: key,
					cdr: [day.cdr[0], day.cdr[1], day.cdr[2]]
				});
			}
		}
		// 国と色を固定する
		this.hbar_color.domain(clist);
		this.nowdatestr = chart.timeFormat(daterange[1]);
		dispdata.slider.date.value = this.nowdatestr;
		dispdata.slider.date.data = this.createDateRange(daterange[0], daterange[1]);
	}
	public resetScale(scale: XScaleType) {
		const xd = this.hbar_x.domain();
		switch (scale) {
			case "liner":
				this.hbar_x = d3.scaleLinear();
				xd[0] = 0;
				break;
			case "log":
				this.hbar_x = d3.scaleLog().clamp(true);
				xd[0] = 1;
				break;
			default:
				const _exhaustiveCheck: never = scale;
				break;
		}
		this.hbar_x.range([0, this.width]);
		this.hbar_x.domain(xd);
		this.hbar_x.nice();
		this.hbar_xAxis.scale(this.hbar_x);
	}
	public draw(): void {
		if (!this.hbardata) {
			// undefinedチェック
			return;
		}

		this.hbar = this.svg.selectAll<SVGGElement, ChartPathData>(".hbar")
			.data(this.hbardata)
			.enter()
			.append("g")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.attr("class", "hbar");

		this.hbar.append("rect")
			.style("fill", d => this.hbar_color(d.name))
			.attr("x", 0)
			.attr("y", (d, i) => this.hbar_y(i))
			.attr("width", d => this.hbar_x(d.data))
			.attr("height", this.barheight);

		this.hbar.append("text")			// 国名
			.attr("class", "line")
			.attr("font-size", this.barheight + "px")
			.attr("x", d => this.hbar_x(d.data))
			.attr("y", (d, i) => this.hbar_y(i) + this.barheight)
			.style("fill", "black")
			.style("stroke", "black")
			.style("stroke-width", "0px")
			.text((d, i) => `${i + 1}. ${d.name}`);

		this.hbar.append("title")
			.text((d, i) => `country:${d.name}\nrank:${i + 1}\ndata:${chart.formatNumberConmma(d.data)}`);

		this.svg.append("g")				// 全体x目盛軸
			.attr("class", "x axis")
			.attr("transform", `translate(${this.margin.left},${this.height + this.margin.top})`)
			.call(this.hbar_xAxis);

		this.svg.append("g")				// 全体y目盛軸
			.attr("class", "y axis")
			.attr("transform", `translate(${this.margin.left},${this.margin.top})`)
			.call(this.hbar_yAxis);
	}
}

class Client extends client.BaseClient<QueryStr, XScaleType> implements client.IClient<QueryStr> {
	private date: string;

	constructor(query: string = "") {
		super(new HorizontalBarChart(svgIDhbar));
		this.date = "20200410";
		this.run(query);
	}
	public createDefaultQuery(): client.Query<QueryStr> {
		const q = new client.Query<QueryStr>();
		q.set("category", chart.categoryDefault);
		q.set("rank", "30");
		q.set("xscale", chart.scaleDefault);
		q.set("date", this.date);
		return q;
	}
	public loadQuery(query: string): void {
		if (!query) {
			query = location.search;
		}
		this.query = this.createDefaultQuery();
		this.query.loadSearchParams(query);
		dispdata.nowcategory = this.query.get("category") as chart.NumberStr;
		dispdata.nowrank = this.query.get("rank") as RankStr;
		dispdata.nowxscale = this.query.get("xscale") as XScaleType;
		dispdata.slider.date.value = this.query.get("date");
	}
	public initQuery(query: string = ""): void {
		const data = dispdata.slider.date.data;
		if (data.length >= 1) {
			this.date = data[data.length - 1];
		}
		this.loadQuery(query);
		this.updateQuery();
	}
	public change(): void {
		this.chart.clear();
		this.chart.resetScale(dispdata.nowxscale);
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
	xscales: [
		{ id: "liner", name: "線形" },
		{ id: "log", name: "対数" },
	],
	slider: {
		date: {
			value: "20200401",
			data: []
		}
	},
	ranks: [
		{ id: "rank10", name: "上位10ヶ国", value: "10" },
		{ id: "rank30", name: "上位30ヶ国", value: "30" },
		{ id: "rank50", name: "上位50ヶ国", value: "50" },
		{ id: "rank100", name: "上位100ヶ国", value: "100" },
	],
	nowcategory: chart.categoryDefault,
	nowxscale: chart.scaleDefault,
	nowrank: "30",
};
const vm = new Vue({
	el: "#container",
	data: dispdata,
	components: {
		'VueSlider': VueSlider,
	},
	methods: {
		categoryChange: () => cli.update([["category", dispdata.nowcategory]]),
		xscaleChange: () => cli.update([["xscale", dispdata.nowxscale]]),
		sliderChange: () => cli.update([["date", dispdata.slider.date.value]]),
		rankChange: () => cli.update([["rank", dispdata.nowrank]])
	}
});
const cli = new Client(location.search);
