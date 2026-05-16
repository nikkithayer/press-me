import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAdmin } from './utils/admin.js'

const relationships = [
  'a long lost childhood friend of the host',
  'a former business partner of the host',
  'the host\'s estranged sibling',
  'a college roommate of the host',
  'the host\'s ex-spouse',
  'a former colleague from the host\'s previous job',
  'the host\'s neighbor from their old apartment',
  'a member of the host\'s book club',
  'the host\'s personal trainer',
  'a friend from the host\'s hiking group'
]

const alibis = [
  'the host owes you money',
  'you\'re here to collect on a bet you won',
  'you\'re delivering a package for a mutual friend',
  'you\'re here to discuss a business opportunity',
  'you\'re attending as the host\'s plus-one',
  'you\'re here to pick up something you left behind',
  'you\'re delivering a message from a mutual acquaintance',
  'you\'re here to finalize plans for an upcoming trip',
  'you\'re attending as a favor to the host',
  'you\'re here to discuss a shared investment'
]

function AgentTab({ agentName, firstName, lastName, currentUser, onLogout }) {
  const navigate = useNavigate()
  const [agentNameVisible, setAgentNameVisible] = useState(false)
  const [realNameVisible, setRealNameVisible] = useState(false)
  const [relationship, setRelationship] = useState('')
  const [alibi, setAlibi] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [modalRelationship, setModalRelationship] = useState('')
  const [modalAlibi, setModalAlibi] = useState('')

  const getRandomBackstory = () => {
    setRelationship(relationships[Math.floor(Math.random() * relationships.length)])
    setAlibi(alibis[Math.floor(Math.random() * alibis.length)])
  }

  useEffect(() => {
    getRandomBackstory()
  }, [])

  useEffect(() => {
    if (agentNameVisible) {
      const timer = setTimeout(() => setAgentNameVisible(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [agentNameVisible])

  useEffect(() => {
    if (realNameVisible) {
      const timer = setTimeout(() => setRealNameVisible(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [realNameVisible])

  const openModal = () => {
    setModalRelationship(relationship)
    setModalAlibi(alibi)
    setShowModal(true)
  }

  const closeModal = () => {
    setIsClosing(true)
    setTimeout(() => {
      setShowModal(false)
      setIsClosing(false)
    }, 300)
  }

  const saveModal = () => {
    setRelationship(modalRelationship)
    setAlibi(modalAlibi)
    closeModal()
  }

  const EyeOpen = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/>
    </svg>
  )

  const EyeClosed = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/>
    </svg>
  )

  return (
    <div className="tab-content">
      <div className="agent-card">
        <h3>Classified</h3>
        <h4>Reveal to trusted associates only</h4>

        <div className="field-group">
          <div className="field-label">Agent</div>
          <div className={`field-row ${agentNameVisible ? 'visible' : 'hidden'}`}>
            <span>{agentName}</span>
            <button onClick={() => setAgentNameVisible(!agentNameVisible)} className="toggle-button">
              {agentNameVisible ? <EyeOpen /> : <EyeClosed />}
              <span className="button-text">{agentNameVisible ? 'hide' : 'reveal'}</span>
            </button>
          </div>
        </div>

        <div className="field-group">
          <div className="field-label">AKA</div>
          <div className={`field-row ${realNameVisible ? 'visible' : 'hidden'}`}>
            <span>{firstName} {lastName}</span>
            <button onClick={() => setRealNameVisible(!realNameVisible)} className="toggle-button">
              {realNameVisible ? <EyeOpen /> : <EyeClosed />}
              <span className="button-text">{realNameVisible ? 'hide' : 'reveal'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="backstory-card">
        <h3>Cover story</h3>
        <p>You are {firstName} {lastName}, <span className="relationship">{relationship}</span>. You are here tonight because <span className="alibi">{alibi}</span>.</p>
        <div className="backstory-buttons">
          <button onClick={getRandomBackstory} className="reroll-button">Shuffle</button>
          <button onClick={openModal} className="write-your-own-button">Write your own</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        {isAdmin(currentUser) && (
          <button
            onClick={() => navigate('/admin/login')}
            className="admin-button button-min"
            style={{ marginRight: '10px' }}
          >
            ADMIN
          </button>
        )}
        <button onClick={onLogout} className="logout-button button-min">LOGOUT</button>
      </div>

      {showModal && (
        <div className={`modal ${isClosing ? 'closing' : ''}`}>
          <div className="modal-header">
            <button onClick={closeModal} className="close-button">Close</button>
          </div>
          <div className="modal-content">
            <h2>Write Your Own!</h2>
            <div className="field-group">
              <label htmlFor="relationship-field">Relationship</label>
              <div className="input-with-clear">
                <textarea
                  id="relationship-field"
                  value={modalRelationship}
                  onChange={(e) => setModalRelationship(e.target.value)}
                  placeholder="Enter your relationship to the host..."
                />
                <button onClick={() => setModalRelationship('')} className="clear-button">
                  <img src="/svgs/X.svg" alt="Clear" />
                </button>
              </div>
            </div>
            <div className="field-group">
              <label htmlFor="alibi-field">Alibi</label>
              <div className="input-with-clear">
                <textarea
                  id="alibi-field"
                  value={modalAlibi}
                  onChange={(e) => setModalAlibi(e.target.value)}
                  placeholder="Enter your reason for being here..."
                />
                <button onClick={() => setModalAlibi('')} className="clear-button">
                  <img src="/svgs/X.svg" alt="Clear" />
                </button>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button onClick={closeModal} className="cancel-button">Cancel</button>
            <button onClick={saveModal} className="save-button">Save</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgentTab
