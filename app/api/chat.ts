import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY
});

export async function sendMessageAnthropic(message: string) {
    try {
        console.log(`Message: ${message}`);
        const response = await anthropic.messages
            .create({
                model: "claude-3-5-sonnet-20240620",
                max_tokens: 1024,
                messages: [
                    { role: "user", content: message }
                ]
            })
            .catch(async (err) => {
                if (err instanceof Anthropic.APIError) {
                    console.log(err.status);
                    console.log(err.name);
                    console.log(err.headers);
                    throw err;
                } else {
                    throw err;
                }
            });

        return {
            success: true,
            data: {
                content: response.content[0].text
            }
        };
    } catch (error) {
        console.error('Error processing chat request:', error);
        return {
            success: false,
            error: 'Failed to process request'
        };
    }
}