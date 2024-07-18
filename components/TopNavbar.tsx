'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import TopLeftFloatingMenuIcon from '@/app/top left floating menu.svg';

// Dummy data for conversations
const dummyConversations = [
    { id: 1, title: 'Conversation 1' },
    { id: 2, title: 'Conversation 2' },
    { id: 3, title: 'Conversation 3' },
];

// Dropdown component
const ConversationDropdown: React.FC<{ isOpen: boolean; conversations: any[] }> = ({ isOpen, conversations }) => {
    if (!isOpen) return null;

    return (
        <div className="absolute top-full left-2 mt-2 w-64 bg-gray-800 border border-gray-700 rounded shadow-lg">
            <ul className="py-2">
                {conversations.map((conv) => (
                    <li key={conv.id} className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-white">
                        {conv.title}
                    </li>
                ))}
            </ul>
        </div>
    );
};

const TopNavbar: React.FC = () => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const toggleDropdown = () => setIsDropdownOpen(!isDropdownOpen);

    return (
        <nav className="w-full border-b-2 border-slate-700 bg-black flex items-center p-2 relative">
            <button className="text-white" onClick={toggleDropdown}>
                <Image src={TopLeftFloatingMenuIcon} alt="Menu icon" width={24} height={24} />
            </button>
            <ConversationDropdown isOpen={isDropdownOpen} conversations={dummyConversations} />
            <div className="flex-grow flex justify-center">
                <h1 className="text-white text-xl font-bold">TreeChat</h1>
            </div>
            {/* Add other nav items here if needed */}
        </nav>
    );
};

export default TopNavbar;