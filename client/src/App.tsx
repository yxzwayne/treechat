import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ConversationView from './ConversationView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ConversationView />} />
        <Route path="/c/:id" element={<ConversationView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
