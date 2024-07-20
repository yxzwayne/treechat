import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: Request) {
    const anthropic = new Anthropic({
        apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
    });

    try {
        const { message } = await request.json();
        const response = await anthropic.messages.create({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            messages: [
                { role: "user", content: message }
            ]
        });

        const responseText = response.content[0].type === 'text'
            ? response.content[0].text
            : 'Non-text response received';
        return NextResponse.json({ response: responseText });
    } catch (error) {
        console.error('Error:', error);
        return NextResponse.json({ error: 'An error occurred while processing your request.' }, { status: 500 });
    }
}