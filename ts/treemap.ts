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
	date: string;
	cdr: CDR;
}
type CountrySummary = {
	daily: DatasetSimple[];
	cdr: CDR;
}
type WorldSummary = {
	countrys: { [key in string]: CountrySummary };
	cdr: CDR;
}

type DateSummary = {
	daily: {
		[datestr in string]: {
			countrys: { [country in string]: {
				cdr: CDR;
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

type NumberStr = "confirmed" | "deaths" | "recovered";

type Display = {
	confirmed_now: string;
	deaths_now: string;
	recovered_now: string;
	categorys: Array<{ id: NumberStr, name: string }>;
	slider: {
		date: {
			value: string;
			data: string[];
		};
	};
	nowcategory: NumberStr;
}

const NumberIndex: { readonly [key in NumberStr]: number } = {
	confirmed: 0,
	deaths: 1,
	recovered: 2,
};
const svgIDTreemap = "svgtreemap";
const summaryUrl = "/data/daily_reports/summary.json";

const formatNumberSuffix = d3.format(",.3s");
const formatNumberConmma = d3.format(",d");
const formatNumberFloat = d3.format(".2f");

const timeFormat = d3.timeFormat("%Y/%m/%d");
const base64encode = (str: string): string => window.btoa(unescape(encodeURIComponent(str)));
const base64decode = (str: string): string => decodeURIComponent(escape(window.atob(str)));
const atoi = (str: string): number => parseInt(str, 10);
const strToDate = (str: string): Date => {
	const datearray = str.split("/").map<number>(atoi);
	// 月は-1しないと期待通りに動作しない
	return new Date(datearray[0], datearray[1] - 1, datearray[2]);
}

class TreemapChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private nodes?: HierarchyDatum;
	private raw?: WorldSummary;
	private data?: DateSummary;
	private target: NumberStr;
	private colorReds: (num: number) => string;
	private colorGreens: (num: number) => string;
	private now: { [key in NumberStr]: number };
	private nowdatestr: string;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1600;
		this.height = Math.min(this.width, 720) - this.margin.top - this.margin.bottom;
		this.width = this.width - this.margin.left - this.margin.right;
		this.colorReds = d3.interpolate("lightpink", "red");
		this.colorGreens = d3.interpolate("lightgreen", "green");
		this.target = "confirmed";
		this.now = {
			confirmed: 0,
			deaths: 0,
			recovered: 0
		};
		this.nowdatestr = "2020/04/01";

		this.svg = d3.select("#" + this.svgid).append("svg");
		this.svg
			.attr("width", this.width + this.margin.left + this.margin.right + 10)
			.attr("height", this.height + this.margin.top + this.margin.bottom + 10);
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
		if (!this.data || !this.data.daily) {
			return;
		}
		this.nodes = {
			name: "世界の様子",
			value: 0,
			children: []
		};
		this.target = target;
		dispdata.nowcategory = target;
		this.now = {
			confirmed: 0,
			deaths: 0,
			recovered: 0,
		};
		const index = NumberIndex[target];
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
		dispdata.confirmed_now = formatNumberConmma(this.now.confirmed);
		dispdata.deaths_now = formatNumberConmma(this.now.deaths);
		dispdata.recovered_now = formatNumberConmma(this.now.recovered);
	}
	public addData(raw: WorldSummary): void {
		this.raw = raw;
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
				const date = strToDate(day.date);
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
		this.nowdatestr = timeFormat(daterange[1]);
		dispdata.slider.date.value = this.nowdatestr;
		let date: Date = new Date(daterange[0].getTime());
		while (date <= daterange[1]) {
			dispdata.slider.date.data.push(timeFormat(date));
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
			return p > 0 ? `▼${formatNumberFloat(p)}%` : `▲${formatNumberFloat(p)}%`;
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
				name: formatNumberSuffix(d.data.value),
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
			.text(d => `${d.data.name}\n${formatNumberConmma(d.data.value)}`);
	}
}

class Client {
	private treemap: TreemapChart;

	constructor() {
		this.treemap = new TreemapChart(svgIDTreemap);
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
			this.treemap.addData(value);
			this.changeCategory("confirmed");
		}).catch(error => {
			console.error(error);
		});
	}
	public dispose(): void {
		this.treemap?.dispose();
	}
	public changeCategory(cate: NumberStr): void {
		this.treemap.clear();
		this.treemap.changeData(cate);
		this.treemap.draw();
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
			value: "2020/04/01",
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
			cli.changeCategory(dispdata.nowcategory);
		},
		sliderChange: () => {
			cli.changeCategory(dispdata.nowcategory);
		},
	}
});
const cli = new Client();
cli.run();