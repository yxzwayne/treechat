'use client';

import { useState } from 'react';

export default function NewChatBox() {
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = async (message: string) => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message }),
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            const data = await response.json();
            console.log('Anthropic response:', data.response);
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col mt-[18vh] p-4 bg-slate-700 min-w-[400px] gap-4">
            <h2>Start typing to prompt or initiate a conversation!</h2>
            <textarea
                className="w-full min-h-[200px] p-2 bg-gray-200 text-[#222]"
                placeholder="Enter your prompt here"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
            ></textarea>
            <button
                className="w-full p-2 bg-sky-500 disabled:opacity-50"
                disabled={inputText.trim() === '' || isLoading}
                onClick={() => sendMessage(inputText)}
            >
                {isLoading ? 'Sending...' : 'Send'}
            </button>
        </div>
    );
}