import React from 'react'

function MissionsTab({ isInActiveSession, missions, currentPhase, completedMissions, onMissionClick }) {
  if (!isInActiveSession) {
    return (
      <div className="tab-content">
        <div className="no-session-message">
          <h2>THE PARTY HASN'T STARTED YET</h2>
          <p>Wait for the host to start a session. Once a session is active, your missions will appear here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content">
      {[0, 1, 2, 3].map(phase => {
        const phaseMissions = missions.filter(m => m.phase === phase)
        if (phaseMissions.length === 0) return null
        const isLocked = phase < currentPhase

        return (
          <div key={phase} style={{ marginBottom: '16px' }}>
            <div className="missions-grid">
              {phaseMissions
                .filter(m => !completedMissions.has(m.playerMissionId))
                .map(mission => (
                  <div
                    key={mission.playerMissionId}
                    className={`mission-card ${!isLocked ? 'clickable' : ''}`}
                    onClick={() => !isLocked && onMissionClick(mission.playerMissionId)}
                    style={{ opacity: isLocked ? 0.5 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}
                  >
                    <div className="mission-header">
                      <h3>{mission.title}</h3>
                      {mission.bounty > 0 && (
                        <span style={{ fontSize: '0.75em', color: '#b8860b', fontWeight: 'bold' }}>{mission.bounty}pts</span>
                      )}
                    </div>
                    <p style={{ whiteSpace: 'pre-line' }}>{mission.missionBody}</p>
                  </div>
                ))}
            </div>

            {phaseMissions.some(m => completedMissions.has(m.playerMissionId)) && (
              <div className="completed-missions">
                <ul>
                  {phaseMissions
                    .filter(m => completedMissions.has(m.playerMissionId))
                    .map(mission => (
                      <li
                        key={mission.playerMissionId}
                        onClick={() => onMissionClick(mission.playerMissionId)}
                        style={{ cursor: 'pointer', textDecoration: 'underline', position: 'relative', display: 'inline-block' }}
                      >
                        {mission.title}
                        {mission.bountyPaid && mission.bounty > 0 && (
                          <span className="paid-stamp">PAID</span>
                        )}
                        {mission.completed && !mission.bountyPaid && mission.bounty > 0 && (
                          <span style={{ marginLeft: '6px', color: '#b8860b', fontWeight: 'bold', fontSize: '0.85em' }}>({mission.bounty}pts)</span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default MissionsTab
