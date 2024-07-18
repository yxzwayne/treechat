import React, { useState } from 'react';


const ChatPanel: React.FC<{ isLeftPanelOpen: boolean }> = ({ isLeftPanelOpen }) => {
  return (
    <div
      className={`flex-grow transition-all duration-300 ease-in-out ${isLeftPanelOpen ? 'ml-64' : 'ml-0'} h-full`}
    >
      {/* TODO: Actually implement this lol */}
    </div>
  );
};

export default ChatPanel;