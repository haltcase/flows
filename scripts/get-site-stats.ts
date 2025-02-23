import * as core from "@actions/core";
import { getClient } from "@umami/api-client";
import { format, subDays } from "date-fns";
import { marked } from "marked";
import tablemark from "tablemark";

import {
	handleError,
	type UmamiApiResponse,
	type UnwrappedUmamiResponseData
} from "./shared.ts";

const umamiSiteId = process.env.UMAMI_SITE_ID;

const percentChange = (from = 0, to = 0) => {
	if (from === to) {
		return "no change";
	}

	if (from > to) {
		return `-${Math.round(((from - to) / from) * 100)}%`;
	}

	return `+${Math.round(((to - from) / from) * 100)}%`;
};

export const produceReport = async (siteId: string): Promise<void> => {
	const client = getClient();

	type Data = UnwrappedUmamiResponseData<typeof client.getWebsite>;

	const {
		ok,
		data: website,
		error
	} = (await client.getWebsite(siteId)) as UmamiApiResponse<Data>;

	if (!ok) {
		handleError(`Failed to fetch website: ${error}`);
	}

	const currentDate = new Date();
	const precedingDate = subDays(currentDate, 7);

	const timePeriod = {
		startAt: precedingDate.valueOf(),
		endAt: currentDate.valueOf()
	};

	const timezone = "US/Central";
	const unit = "day";

	const [stats, pageviews, events, metrics] = await Promise.all([
		client.getWebsiteStats(website.id, {
			...timePeriod
		}),

		client.getWebsitePageviews(website.id, {
			...timePeriod,
			timezone,
			unit
		}),

		client.getWebsiteEvents(website.id, {
			...timePeriod,
			// @ts-expect-error types are wrong
			// timezone,
			unit
		}),

		client.getWebsiteMetrics(website.id, {
			...timePeriod,
			type: "url"
		})
	]);

	if ([stats.ok, pageviews.ok, events.ok, metrics.ok].some((isOk) => !isOk)) {
		const statsErrors = [
			stats.error,
			pageviews.error,
			events.error,
			metrics.error
		]
			.filter(Boolean)
			.map(String)
			.join("\n");

		handleError(`Failed to fetch website data: ${statsErrors}`);
	}

	const precedingDateIso = format(precedingDate, "yyyy-MM-dd");
	const currentDateIso = format(currentDate, "yyyy-MM-dd");
	const timeRange = `${precedingDateIso} &ndash; ${currentDateIso}`;

	const peakDay = (
		(pageviews.data?.pageviews ?? []) as unknown as { x: string; y: number }[]
	)
		.toSorted((b, a) => b.y - a.y)
		.at(0);

	const metricsData = ((metrics.data ?? []) as { x: string; y: number }[]).map(
		({ x, y }) => ({ path: `\`${x}\``, views: y })
	);

	const values = [
		{
			name: "Views",
			currentPeriod: stats.data?.pageviews.value,
			previousPeriod: stats.data?.pageviews.prev
		},
		{
			name: "Visitors",
			currentPeriod: stats.data?.visitors.value,
			previousPeriod: stats.data?.visitors.prev
		},
		{
			name: "Bounces",
			currentPeriod: stats.data?.bounces.value,
			previousPeriod: stats.data?.bounces.prev
		}
	];

	const subject = `Umami stats update for ${website.domain} ${precedingDateIso} thru ${currentDateIso}`;

	const bodyMarkdown = `
# Stats for ${website.domain} &middot; ${timeRange}

${tablemark(
	values.map(({ name, previousPeriod, currentPeriod }) => ({
		name,
		currentPeriod,
		previousPeriod,
		change: percentChange(previousPeriod, currentPeriod)
	})),
	{
		columns: [
			{ align: "left" },
			{ align: "right" },
			{ align: "right" },
			{ align: "right" }
		]
	}
)}

${peakDay ? `**Peak day**: ${peakDay.y} view(s) on ${peakDay.x}` : ""}

## Paths

${tablemark(metricsData, {
	columns: [{ align: "left" }, { align: "right" }]
})}
`;

	const body = marked.parse(bodyMarkdown, {
		gfm: true
	});

	core.setOutput("report_subject", subject);
	core.setOutput("report_body", body);
};

if (!umamiSiteId) {
	handleError("UMAMI_SITE_ID is required");
}

await produceReport(umamiSiteId);
