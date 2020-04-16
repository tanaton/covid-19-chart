import * as d3 from 'd3';
import Vue from 'vue';

type Box = {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

type Dataset = {
	confirmed: number;
	deaths: number;
	recovered: number;
	last_update?: number;
	latitude?: number;
	longitude?: number;
	children?: {
		[key in string]: Dataset;
	}
}
type DailyData = {
	[key in string]: Dataset;
}

type HierarchyDatum = {
	name: string;
	value: number;
	active?: [number, number];
	children?: HierarchyDatum[];
}

type NumberStr = "confirmed" | "deaths" | "recovered";

type Display = {
	confirmed_now: number;
	deaths_now: number;
	recovered_now: number;
	categorys: Array<{ id: NumberStr, name: string }>;
	nowcategory: NumberStr;
}

const svgIDTreemap = "svgtreemap";
const treemapUrlToday = "/data/daily_reports/today.json";
const treemapUrl1dayago = "/data/daily_reports/-1day.json";
const treemapUrl2dayago = "/data/daily_reports/-2day.json";

class TreemapChart {
	private readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	private width: number;
	private height: number;

	private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	private svgid: string;
	private nodes?: HierarchyDatum;
	private data?: Array<DailyData>;
	private target: NumberStr;
	private colorReds: (num: number) => string;
	private colorGreens: (num: number) => string;
	private now: { [key in NumberStr]: number };

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1560;
		this.width = this.width - this.margin.left - this.margin.right;
		this.height = 720 - this.margin.top - this.margin.bottom;
		this.colorReds = d3.interpolate("lightpink", "red");
		this.colorGreens = d3.interpolate("lightgreen", "green");
		this.target = "confirmed";
		this.now = {
			confirmed: 0,
			deaths: 0,
			recovered: 0
		};

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
	private childrenWalk(key: string, data: Dataset, _1dayago?: Dataset): HierarchyDatum {
		const hd: HierarchyDatum = {
			name: key,
			value: data[this.target],
			active: [
				data.confirmed - data.deaths - data.recovered,
				_1dayago ? _1dayago.confirmed - _1dayago.deaths - _1dayago.recovered : 0,
			]
		};
		for (const objkey in data.children) {
			if (!data.children.hasOwnProperty(objkey)) {
				continue;
			}
			let val1dayago: Dataset | undefined;
			if (_1dayago?.children?.hasOwnProperty(objkey)) {
				val1dayago = _1dayago.children[objkey];
			}
			if (!hd.children) {
				hd.children = [];
			}
			//hd.children.push(this.childrenWalk(objkey, data.children[objkey], val1dayago));
		}
		return hd;
	}
	public changeData(target: NumberStr): void {
		if (!this.data) {
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
		for (const key in this.data[0]) {
			if (!this.data[0].hasOwnProperty(key)) {
				continue;
			}
			let val1dayago: Dataset | undefined;
			if (this.data[1] && this.data[1].hasOwnProperty(key)) {
				val1dayago = this.data[1][key];
			}
			this.nodes.children?.push(this.childrenWalk(key, this.data[0][key], val1dayago));
			this.now.confirmed += this.data[0][key].confirmed;
			this.now.deaths += this.data[0][key].deaths;
			this.now.recovered += this.data[0][key].recovered;
		}
		dispdata.confirmed_now = this.now.confirmed;
		dispdata.deaths_now = this.now.deaths;
		dispdata.recovered_now = this.now.recovered;
	}
	public addData(data: DailyData[]): void {
		this.data = data;
		this.changeData(this.target);
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
			if (s > 100) {
				s = 100;
			} else if (s < 5) {
				s = 5;
			}
			return s;
		}
		const numfs = d3.format(",.3s");
		const numf = d3.format(",d");
		const numff = d3.format(".2f");
		const visiblemin = this.now[this.target] / 10000;
		const percent = (active?: [number, number]): string => {
			if (!active) {
				return "";
			}
			if (active[0] == 0) {
				return "";
			}
			const p = 100 - ((active[1] / active[0]) * 100);
			return p > 0 ? `▼${numff(p)}%` : `▲${numff(p)}%`;
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
				name: numfs(d.data.value),
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
			.text(d => `${d.data.name}\n${numf(d.data.value)}`);
	}
}

class Client {
	private treemap: TreemapChart;

	constructor() {
		this.treemap = new TreemapChart(svgIDTreemap);
	}
	public run(): void {
		const httpget = (url: string): Promise<DailyData> => {
			return new Promise<DailyData>((resolve, reject) => {
				Client.get(url, xhr => {
					resolve(JSON.parse(xhr.responseText));
				}, (txt: string) => {
					reject(txt);
				});
			});
		};
		Promise.all<DailyData>([
			httpget(treemapUrlToday),
			httpget(treemapUrl1dayago)
		]).then(values => {
			this.treemap.addData(values);
			this.treemap.draw();
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
	confirmed_now: 0,
	deaths_now: 0,
	recovered_now: 0,
	categorys: [
		{ id: "confirmed", name: "感染数" },
		{ id: "deaths", name: "死亡数" },
		{ id: "recovered", name: "回復数" }
	],
	nowcategory: "confirmed"
};
const vm = new Vue({
	el: "#container",
	data: dispdata,
	methods: {
		categoryChange: () => {
			cli.changeCategory(dispdata.nowcategory);
		}
	}
});
const cli = new Client();
cli.run();