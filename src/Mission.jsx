import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { addBounce } from './helpers.js'

function Mission({ alias1, alias2, realName, onLogout }) {
  const navigate = useNavigate()
  const effectRef1 = useRef(null)
  const effectRef2 = useRef(null)

  const handleLogout = () => {
    onLogout()
  }

  // Apply addBounce effect when component mounts
  useEffect(() => {
    if (effectRef1.current) {
      addBounce(effectRef1.current)
    }
    if (effectRef2.current) {
      addBounce(effectRef2.current)
    }
  }, [])


  return (
    <div className="mission-container">
      <div className="mission-header">
        <div className="agent-header">
        <p>Hello, Agent.</p>
        </div>
    </div>
    <div className="mission-content">
      <div className="mission-objectives">
        <p>We've been following the movements of a mysterious hacker known as <strong>TH33_HACKERG0D</strong> and have reason to believe they are planning to detonate a doomsday device at some point on the evening of Saturday, May 16.</p>
        <p>The device itself is located somewhere on the premises of <strong>MacGuffin Toys</strong>. You will be infiltrating the environment as part of their annual company party.</p>
        <p>Initial intelligence suggests the company's employees are not very bright.</p>
        <p>Your mission is to determine the location of this doomsday device and disable it. We've prepared a series of smaller missions that will help you maintain cover and locate the device. You can do missions in any order.</p>
        <p>Due to the severity of the threat, we may have sent a few too many agents to retrieve the device. If you see a fellow agent in disguise, please be respectful and do not blow their cover. Sign off on missions if they ask.</p>
        <p>Good luck, have fun, and don't get caught.</p>
      </div>
      <button 
          className="mission-button"
          onClick={() => navigate('/dashboard')}
        >
          Accept mission
      </button>
    </div>

  </div>
        
  )
}

export default Mission 
