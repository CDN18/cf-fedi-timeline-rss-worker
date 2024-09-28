import { Feed } from 'feed';
import { Env } from './index';

interface MisskeyUser {
    id: string;
    name: string;
    username: string;
    host: string | null;
    avatarUrl: string | null;
}

interface MisskeyFile {
    id: string;
    type: string;
    url: string;
}

interface MisskeyNote {
    id: string;
    createdAt: string;
    text: string | null;
    cw: string | null;
    user: MisskeyUser;
    files: MisskeyFile[];
    renote?: MisskeyNote;
    reply?: MisskeyNote;
    visibility: string;
    uri?: string;
    url?: string;
}

interface MisskeyAccount {
    id: string;
    name: string;
    username: string;
}

export async function handleMisskeyRequest(instance_url: string, access_token: string, env: Env, ctx: ExecutionContext): Promise<Response> {
    const headers = {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Fedi Timeline RSS Worker',
    };

    // Get account info
    const accountResponse = await fetch(`https://${instance_url}/api/i`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
    });

    if (!accountResponse.ok) {
        return new Response(accountResponse.statusText, { status: accountResponse.status });
    }

    const accountInfo: MisskeyAccount = await accountResponse.json();
    let account = accountInfo.username;
    if (!account.includes('@')) {
        account = `${account}@${instance_url}`;
    }

    // Get home timeline
    const timelineResponse = await fetch(`https://${instance_url}/api/notes/timeline`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            includeMyRenotes: true,
            includeRenotedMyNotes: true,
            includeLocalRenotes: true,
            withFiles: true,
            withRenotes: true,
        }),
    });

    if (!timelineResponse.ok) {
        return new Response(timelineResponse.statusText, { status: timelineResponse.status });
    }

    const notes: MisskeyNote[] = await timelineResponse.json();

    const feed = new Feed({
        title: `${account}'s Timeline`,
        id: instance_url + `-` +  access_token.slice(-4),
        link: `https://${instance_url}/@${accountInfo.username.split('@')[0]}`,
        updated: new Date(),
        generator: 'Fedi Timeline RSS Worker',
        copyright: 'Powered by Fedi Timeline RSS Worker, created by Owu One. All rights of the notes in this feed belong to the original authors.',
    });

    for (const note of notes) {
        const item = await noteToItem(note, instance_url);
        feed.addItem(item);
    }

    return new Response(feed.rss2(), {
        headers: { 'Content-Type': 'application/rss+xml' },
    });
}

async function noteToItem(note: MisskeyNote, instance_url: string) {
    const author = getUserName(note.user, instance_url);
    let content = '';

    // Process Spoiler
    if (note.cw) {
        content += `<p><strong>CW: ${note.cw}</strong></p>`;
    }

    // Process Reply
    if (note.reply) {
        const replyAuthor = getUserName(note.reply.user, instance_url);
        content += `<p>Replying to ${replyAuthor}:</p>`;
        content += await constructNoteContent(note.reply, instance_url);
    }

    // Process Note
    content += await constructNoteContent(note, instance_url);

    // Process Renote
    if (note.renote) {
        const renoteAuthor = getUserName(note.renote.user, instance_url);
        content += `<p>Renoted from ${renoteAuthor}:</p>`;
        content += await constructNoteContent(note.renote, instance_url);
    }

    return {
        title: `${author}: ${note.text ? note.text.substring(0, 50) : 'No text'}...`,
        id: note.id,
        link: note.url || `https://${instance_url}/notes/${note.id}`,
        content: content,
        author: [{ name: author }],
        date: new Date(note.createdAt),
    };
}

function getUserName(user: MisskeyUser, instance_url: string): string {
    const name = user.name || user.username;
    const username = user.username.includes('@') ? user.username : `${user.username}@${instance_url}`;
    return `${name} (${username})`;
}

async function constructNoteContent(note: MisskeyNote, instance_url: string): Promise<string> {
    let content = note.text ? `<p>${note.text}</p>` : '';

    // Process Files
    for (const file of note.files) {
        switch (file.type) {
            case 'image/jpeg':
            case 'image/png':
            case 'image/gif':
                content += `<img src="${file.url}" alt="Image Attachment">`;
                break;
            case 'video/mp4':
                content += `<video src="${file.url}" controls>Video Attachment</video>`;
                break;
            case 'audio/mpeg':
            case 'audio/ogg':
                content += `<audio src="${file.url}" controls>Audio Attachment</audio>`;
                break;
            default:
                content += `<a href="${file.url}">File Attachment</a>`;
        }
    }

    return content;
}