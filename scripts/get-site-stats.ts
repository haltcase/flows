import { getClient, UmamiApiClient } from "@umami/api-client";
import tablemark from "tablemark";
import { format, subDays } from "date-fns";
import * as core from "@actions/core";

import { handleError } from "./shared.js";

const umamiSiteDomain = process.env.UMAMI_SITE_DOMAIN;

const getWebsiteByDomain = async (client: UmamiApiClient, domain: string) => {
	const { ok, data, error } = await client.getWebsites();

	if (!ok || !data) {
		throw error;
	}

	return data.data.find((site) => site.domain === domain);
};

const percentChange = (from: number = 0, to: number = 0) => {
	if (from === to) {
		return "no change";
	}

	if (from > to) {
		return `-${Math.round(((from - to) / from) * 100)}%`;
	}

	return `+${Math.round(((to - from) / from) * 100)}%`;
};

export const produceReport = async (): Promise<void> => {
	const client = getClient();

	const website = await getWebsiteByDomain(client, umamiSiteDomain || "");

	if (!website) {
		handleError(
			`Could not find website for supplied domain '${umamiSiteDomain}'`
		);
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

		// @ts-expect-error https://github.com/umami-software/api-client/issues/12
		client.getWebsitePageviews(website.id, {
			...timePeriod,
			timezone,
			unit
		}),

		// @ts-expect-error types are wrong
		client.getWebsiteEvents(website.id, {
			...timePeriod,
			timezone,
			unit
		}),

		client.getWebsiteMetrics(website.id, {
			...timePeriod,
			type: "url"
		})
	]);

	if ([stats.ok, pageviews.ok, events.ok, metrics.ok].some((ok) => !ok)) {
		const error = [stats.error, pageviews.error, events.error, metrics.error]
			.filter(Boolean)
			.map((it) => String(it))
			.join("\n");

		handleError(`Failed to fetch website data: ${error}`);
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
			currentPeriod: stats.data?.pageviews?.value,
			// @ts-expect-error umami's types are wrong
			previousPeriod: stats.data?.pageviews?.prev
		},
		{
			name: "Visitors",
			currentPeriod: stats.data?.visitors?.value,
			// @ts-expect-error umami's types are wrong
			previousPeriod: stats.data?.visitors?.prev
		},
		{
			name: "Bounces",
			currentPeriod: stats.data?.bounces?.value,
			// @ts-expect-error umami's types are wrong
			previousPeriod: stats.data?.bounces?.prev
		}
	];

	const subject = `Umami stats update for ${website.domain} ${precedingDateIso} thru ${currentDateIso}`;

	const body = `
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

	core.setOutput("report_subject", subject);
	core.setOutput("report_body", body);
};

await produceReport();
