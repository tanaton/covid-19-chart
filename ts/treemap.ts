import * as d3 from 'd3';
import Vue from 'vue';
import VueSlider from 'vue-slider-component';
import * as chart from "./lib/chart";
import * as client from "./lib/client";

type DateSummary = {
	daily: {
		[datestr in string]: {
			countrys: { [country in string]: {
				cdr: chart.CDR;
				active: [number, number];
			} };
		};
	};
}

type HierarchyDatum = {
	name: string;
	value: number;
	active?: [number, number];
	children?: HierarchyDatum[];
}

type QueryStr = "category" | "date";

type Display = {
	confirmed_now: string;
	deaths_now: string;
	recovered_now: string;
	categorys: Array<{ id: chart.NumberStr, name: string }>;
	slider: {
		date: {
			value: string;
			data: string[];
		};
	};
	nowcategory: chart.NumberStr;
}

const HashIndex: { readonly [key in QueryStr]: number } = {
	category: 0,
	date: 1
};
const svgIDTreemap = "svgtreemap";

class TreemapChart extends chart.BaseChart<unknown> implements chart.IChart<unknown> {
	private nodes?: HierarchyDatum;
	private data?: DateSummary;
	private target: chart.NumberStr;
	private colorReds: (num: number) => string;
	private colorGreens: (num: number) => string;
	private now: { [key in chart.NumberStr]: number };
	private nowdatestr: string;

	constructor(svgid: string) {
		super(svgid);
		this.colorReds = d3.interpolate("lightpink", "red");
		this.colorGreens = d3.interpolate("lightgreen", "green");
		this.target = "confirmed";
		this.now = {
			confirmed: 0,
			deaths: 0,
			recovered: 0
		};
		this.nowdatestr = "20200401";
	}
	public changeData(target: chart.NumberStr): void {
		if (!this.data || !this.data.daily) {
			return;
		}
		this.nodes = {
			name: "世界の様子",
			value: 0,
			children: []
		};
		this.target = target;
		this.now = {
			confirmed: 0,
			deaths: 0,
			recovered: 0,
		};
		const index = chart.NumberIndex[target];
		const datestr = dispdata.slider.date.value;
		const day = (this.data.daily[datestr] !== undefined) ? this.data.daily[datestr] : this.data.daily[this.nowdatestr];
		for (const key in day.countrys) {
			if (!day.countrys.hasOwnProperty(key)) {
				continue;
			}
			const country = day.countrys[key];
			this.nodes?.children?.push({
				name: key,
				value: country.cdr[index],
				active: country.active
			})
			this.now.confirmed += country.cdr[0];
			this.now.deaths += country.cdr[1];
			this.now.recovered += country.cdr[2];
		}
		dispdata.confirmed_now = chart.formatNumberConmma(this.now.confirmed);
		dispdata.deaths_now = chart.formatNumberConmma(this.now.deaths);
		dispdata.recovered_now = chart.formatNumberConmma(this.now.recovered);
	}
	public addData(raw: chart.WorldSummary): void {
		this.data = { daily: {} };
		let daterange: [Date, Date] = [new Date(2099, 0, 1), new Date(2000, 0, 1)];

		for (const key in raw.countrys) {
			if (!raw.countrys.hasOwnProperty(key)) {
				continue;
			}
			const daily = raw.countrys[key].daily;
			if (!daily || daily.length <= 0) {
				continue;
			}
			let olddate: string = "";
			for (const day of daily) {
				const date = chart.strToDate(day.date);
				if (this.data.daily[day.date] === undefined) {
					this.data.daily[day.date] = {
						countrys: {}
					};
				}
				if (this.data.daily[day.date].countrys[key] === undefined) {
					this.data.daily[day.date].countrys[key] = { cdr: [0, 0, 0], active: [0, 0] };
				}
				this.data.daily[day.date].countrys[key].cdr = [day.cdr[0], day.cdr[1], day.cdr[2]];
				if (olddate !== "" && this.data.daily[olddate]?.countrys[key]?.cdr) {
					const yesterday = this.data.daily[olddate]?.countrys[key]?.cdr;
					if (yesterday) {
						this.data.daily[day.date].countrys[key].active = [
							day.cdr[0] - day.cdr[1] - day.cdr[2],
							yesterday[0] - yesterday[1] - yesterday[2]
						];
					}
				}
				// 時間範囲
				if (date < daterange[0]) {
					daterange[0] = date;
				}
				if (date > daterange[1]) {
					daterange[1] = date;
				}
				olddate = day.date;
			}
		}
		this.nowdatestr = chart.timeFormat(daterange[1]);
		dispdata.slider.date.value = this.nowdatestr;
		let date: Date = new Date(daterange[0].getTime());
		while (date <= daterange[1]) {
			dispdata.slider.date.data.push(chart.timeFormat(date));
			date = new Date(date.getTime() + 60 * 60 * 24 * 1000);
		}
	}
	public draw(): void {
		if (!this.nodes) {
			// undefinedチェック
			return;
		}
		const nodes = d3.hierarchy(this.nodes)
			.sum(d => d.value)
			.sort((a, b) => b.data.value - a.data.value);
		const root = d3.treemap<HierarchyDatum>()
			.size([this.width, this.height])
			(nodes);
		const fontsize = (d: d3.HierarchyRectangularNode<HierarchyDatum>): number => {
			let s = (((d.x1 - d.x0) + (d.y1 - d.y0)) / 2) / 5;
			const max = Math.min(Math.floor((d.y1 - d.y0) / 3), 100);
			if (s > max) {
				s = max;
			} else if (s < 5) {
				s = 5;
			}
			return s;
		}
		const visiblemin = this.now[this.target] / 10000;
		const percent = (active?: [number, number]): string => {
			if (!active) {
				return "";
			}
			if (active[0] == 0) {
				return "";
			}
			const p = 100 - ((active[1] / active[0]) * 100);
			return p > 0 ? `▼${chart.formatNumberFloat(p)}%` : `▲${chart.formatNumberFloat(p)}%`;
		}
		const textdata = (d: d3.HierarchyRectangularNode<HierarchyDatum>): Array<{ name: string, size: number }> => {
			if (d.data.value < visiblemin) {
				return [];
			}
			const size = fontsize(d);
			const ret = [{
				name: d.data.name,
				size: size
			}, {
				name: chart.formatNumberSuffix(d.data.value),
				size: size
			}];
			const per = percent(d.data.active);
			if (per !== "") {
				ret.push({
					name: per,
					size: size
				});
			}
			return ret;
		};
		const leaf = this.svg.selectAll("g")
			.data(root.leaves())
			.join("g")
			.attr("transform", d => `translate(${d.x0},${d.y0})`);

		leaf.append("rect")
			.attr('class', 'rect_data')
			.attr('width', d => d.x1 - d.x0)
			.attr('height', d => d.y1 - d.y0)
			.style("stroke", "black")
			.style("fill", (d): string => {
				if (d.data.active) {
					if (d.data.active[0] > d.data.active[1]) {
						return this.colorReds(1.0 - (Math.max(d.data.active[1] / d.data.active[0] - 0.95, 0) * 20));
					} else if (d.data.active[1] != 0) {
						return this.colorGreens(1.0 - (Math.max(d.data.active[0] / d.data.active[1] - 0.95, 0) * 20));
					} else {
						return "red";
					}
				}
				return "red";
			});

		leaf.append("text")
			.attr("font-size", d => fontsize(d) + "px")
			.selectAll("tspan")
			.data(textdata)
			.join("tspan")
			.attr("x", 5)
			.attr("y", (d, i) => d.size * (i + 1))
			.attr("fill", "black")
			.text(d => d.name);

		leaf.append("title")
			.text(d => `${d.data.name}\n${chart.formatNumberConmma(d.data.value)}`);
	}
}

class Client extends client.BaseClient<QueryStr, unknown> implements client.IClient<QueryStr> {
	private date: string;

	constructor(hash: string = "") {
		super(new TreemapChart(svgIDTreemap));
		this.date = "20200401";
		this.setDefaultQuery();
		this.run(hash);
	}
	public setDefaultQuery(): void {
		this.query = [
			["category", dispdata.nowcategory],
			["date", this.date],
		];
	}
	public loadHash(hash: string): void {
		if (!hash) {
			hash = location.search;
		}
		this.setDefaultQuery();
		const url = new URLSearchParams(hash);
		for (const [key, value] of url) {
			const qs = key as QueryStr;
			this.query[HashIndex[qs]] = [qs, value];
		}
		dispdata.nowcategory = this.query[HashIndex["category"]][1] as chart.NumberStr;
		dispdata.slider.date.value = this.query[HashIndex["date"]][1];
	}
	public createHash(query?: [QueryStr, string][]): string {
		if (!query) {
			query = this.query;
		}
		const q = query.filter(it => {
			if (it[0] === "category" && it[1] === "confirmed") {
				return false;
			} else if (it[0] === "date" && it[1] === this.date) {
				return false;
			}
			return true;
		});
		const url = new URLSearchParams();
		for (const it of q) {
			url.append(it[0], it[1]);
		}
		const hash = url.toString();
		return hash !== "" ? "?" + hash : "";
	}
	public initHash(hash: string = ""): void {
		const data = dispdata.slider.date.data;
		if (data.length >= 1) {
			this.date = data[data.length - 1];
		}
		this.loadHash(hash);
		this.updateHash();
	}
	public change(): void {
		this.chart.clear();
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
	slider: {
		date: {
			value: "20200401",
			data: []
		}
	},
	nowcategory: "confirmed"
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
		sliderChange: () => {
			const query = cli.getQuery();
			query[HashIndex["date"]][1] = dispdata.slider.date.value;
			cli.updateHash(query);
		},
	}
});
const cli = new Client(location.search);
