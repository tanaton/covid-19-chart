import * as d3 from 'd3';

export type Box = {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

export type CDR = [number, number, number];

export type DatasetSimple = {
	date: string,
	cdr: CDR
}
export type CountrySummary = {
	daily: DatasetSimple[],
	cdr: CDR
}
export type WorldSummary = {
	countrys: { [key in string]: CountrySummary },
	cdr: CDR
}

export type NumberStr = "confirmed" | "deaths" | "recovered";
export type NumberIndexType = { readonly [key in NumberStr]: number };

export interface IChart<ScaleT> {
	dispose(): void;
	clear(): void;
	changeData(target: NumberStr): void;
	resetScale(scale: ScaleT): void;
	addData(raw: WorldSummary): void;
	draw(): void;
}

export const NumberIndex: NumberIndexType = {
	confirmed: 0,
	deaths: 1,
	recovered: 2,
};

export const timeFormat = d3.timeFormat("%Y%m%d");
export const formatNumberConmma = d3.format(",d");
export const formatNumberSuffix = d3.format(",.3s");
export const formatNumberFloat = d3.format(".2f");
export const line_xd_default: readonly [Date, Date] = [new Date(2099, 11, 31), new Date(2001, 0, 1)];
export const line_yd_default: readonly [number, number] = [0, 0];
export const base64encode = (str: string): string => window.btoa(unescape(encodeURIComponent(str)));
export const base64decode = (str: string): string => decodeURIComponent(escape(window.atob(str)));
export const atoi = (str: string): number => parseInt(str, 10);
export const strToDate = (str: string): Date => {
	const datearray = [str.slice(0, 4), str.slice(4, 6), str.slice(6)].map<number>(atoi);
	// 月は-1しないと期待通りに動作しない
	return new Date(datearray[0], datearray[1] - 1, datearray[2]);
}

export abstract class BaseChart<ScaleT> {
	protected readonly margin: Box = { top: 10, right: 10, bottom: 20, left: 60 };
	protected width: number;
	protected height: number;
	protected svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>;
	protected svgid: string;

	constructor(svgid: string) {
		this.svgid = svgid;
		const div = document.getElementById(this.svgid);
		this.width = div?.offsetWidth ?? 1600;
		this.height = Math.min(this.width, 720) - this.margin.top - this.margin.bottom;
		this.width = this.width - this.margin.left - this.margin.right;

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
	public resetScale(scale: ScaleT): void {

	}
}
