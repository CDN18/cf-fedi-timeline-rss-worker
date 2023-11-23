/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import fetch from 'node-fetch';
import { Feed } from 'feed';

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
}

interface Status {
	id: string;
	created_at: string;
	url: string;
	content: string;
	account: {
	  display_name: string;
	  acct: string;
	};
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const [instance_url, access_token] = url.pathname.split('/').slice(1);
        const endpoint = `https://${instance_url}/api/v1/timelines/home`;
        const headers = { 'Authorization': `Bearer ${access_token}` };

        const response = await fetch(endpoint, { headers });
        if (!response.ok) {
            return new Response(response.statusText, { status: response.status });
        }

        const statuses = await response.json() as Status[];
        const feed = new Feed({
            title: `${instance_url} timeline`,
            id: instance_url,
            link: instance_url,
            updated: new Date(),
            generator: 'Fedi Timeline RSS Worker',
			copyright: 'Powered by Fedi Timeline RSS Worker, created by Owu One. All rights reserved to the original author of the statuses in this feed.',
        });

        statuses.forEach((status: Status) => {
            feed.addItem({
                title: `${status.account.display_name} (${status.account.acct})`,
                id: status.id,
                link: status.url,
                content: status.content,
                date: new Date(status.created_at),
            });
        });

        return new Response(feed.rss2(), {
            headers: { 'Content-Type': 'application/rss+xml' },
        });
    },
};
