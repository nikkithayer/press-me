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
        <p>Welcome, <span>{realName}</span>... or should I say</p>
        </div>

        <div className="agent-intro">
            <p>Special Agent</p>
            <h1 ref={effectRef1} className="rotate">{alias1}</h1>
            <h1 ref={effectRef2} className="rotate">{alias2}</h1>
          </div>
    </div>
    <div className="mission-content">
      <div className="mission-objectives">
        <p>Your objectives are as follows:</p>
        <ul>
          <li>Complete missions.</li>
           <li>Make new friends.</li>
           <li>Do not get caught.</li>
           <li>Ask the hosts if you need help.</li>
           <li>Do not get caught.</li>
        </ul>
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
