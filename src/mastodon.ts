import { Feed } from 'feed';
import { Env } from './index';

interface Status {
    id: string;
    created_at: string;
    url: string;
    content: string;
    reblog: Status;
    spoiler_text: string;
    in_reply_to_id: string;
    media_attachments: MediaAttachment[];
    account: {
        display_name: string;
        acct: string;
    };
}

interface MediaAttachment {
    type: string;
    url: string;
}

interface FeedItem {
    title: string;
    id: string;
    link: string;
    content: string;
    date: Date;
}

interface Account {
    acct: string;
}

export async function handleMastodonRequest(instance_url: string, access_token: string, env: Env, ctx: ExecutionContext): Promise<Response> {
    const endpoint = `https://${instance_url}/api/v1/timelines/home`;
    const headers = { 
        'Authorization': `Bearer ${access_token}`,
        'User-Agent': 'Fedi Timeline RSS Worker',
        'Accept': 'application/json',
    };

    // get account info
    const accountResponse = await fetch(`https://${instance_url}/api/v1/accounts/verify_credentials`, { headers });
    let account = instance_url;
    if (accountResponse.ok) {
        const accountInfo: Account = await accountResponse.json();
        account = accountInfo.acct;
        if (!account.includes('@')) {
            account = `${account}@${instance_url}`;
        }
    }

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
        return new Response(response.statusText, { status: response.status });
    }

    const statuses = await response.json() as Status[];
    const feed = new Feed({
        title: `${account}'s Timeline`,
        id: instance_url + `-` +  access_token.slice(-4),
        link: `https://${instance_url}/@${account.split('@')[0]}`,
        updated: new Date(),
        generator: 'Fedi Timeline RSS Worker',
        copyright: 'Powered by Fedi Timeline RSS Worker, created by Owu One. All rights of the statuses in this feed belong to the original authors.',
    });

    for (const status of statuses) {
        const item = await statusToItem(status, instance_url, access_token);
        feed.addItem(item);
    }
    feed.items.sort((a, b) => b.date.getTime() - a.date.getTime());

    return new Response(feed.rss2(), {
        headers: { 'Content-Type': 'application/rss+xml' },
    });
}

async function getStatus(instance_url: string, access_token: string, id: string): Promise<Status> {
    const endpoint = `https://${instance_url}/api/v1/statuses/${id}`;
    const headers = { 
        'Authorization': `Bearer ${access_token}`,
        'User-Agent': 'Fedi Timeline RSS Worker',
        'Accept': 'application/json',
    };

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
        return {} as Status;
    }

    return await response.json() as Status;
}

function getName(status: Status): string {
    if (status.account.display_name) {
        return status.account.display_name;
    } else if (status.account.acct) {
        return status.account.acct;
    } else {
        return 'Unknown Name';
    }
}

function statusToItem(status: Status, instance_url: string, access_token: string): Promise<FeedItem> {
    return new Promise(async (resolve, reject) => {
        let content = status.content;
        let actualStatus = status;

        // Check reblog
        if (status.reblog) {
            actualStatus = status.reblog;
            const name = getName(actualStatus);
            content = `<p>RT ${name}</p>${actualStatus.content}`;
        }

        // Check spoiler
        if (actualStatus.spoiler_text) {
            content = `<p><strong>CW: ${actualStatus.spoiler_text}</strong></p>${content}`;
        }

        // Check reply
        if (actualStatus.in_reply_to_id) {
            const repliedStatus = await getStatus(instance_url, access_token, actualStatus.in_reply_to_id);
            const name = getName(repliedStatus);
            if (repliedStatus.account) {
                content = `<p>Replying to ${name}:</p>${content}`;
            }
        }

        // Add media attachments
        if (actualStatus.media_attachments && actualStatus.media_attachments.length > 0) {
            for (const media of actualStatus.media_attachments) {
                content += '<br>';
                switch (media.type) {
                    case 'image':
                        content += `<img src="${media.url}" alt="Image Attachment">`;
                        break;
                    case 'video':
                        content += `<video src="${media.url}" controls>Video Attachment</video>`;
                        break;
                    case 'gifv':
                        content += `<video src="${media.url}" autoplay loop muted playsinline>Gif Attachment</video>`;
                        break;
                    case 'audio':
                        content += `<audio src="${media.url}" controls>音频附件</audio>`;
                        break;
                }
            }
        }

        resolve({
            title: getName(status),
            id: status.id,
            link: status.url,
            content: content,
            date: new Date(status.created_at),
        });
    });
}