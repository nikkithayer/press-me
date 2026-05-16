import React from 'react'

export function BriefingMissionRow({ onOpenBriefing }) {
  return (
    <button
      type="button"
      className="mission-card mission-card--completed clickable mission-card--briefing"
      onClick={onOpenBriefing}
    >
      <h3>Briefing</h3>
    </button>
  )
}

function MissionsTab({ isInActiveSession, missions, currentPhase, completedMissions, onMissionClick, onOpenBriefing }) {
  if (!isInActiveSession) {
    return (
      <div className="tab-content">
        <BriefingMissionRow onOpenBriefing={onOpenBriefing} />
        <div className="no-session-message">
          <h2>THE PARTY HASN'T STARTED YET</h2>
          <p>Wait for the host to start a session. Once a session is active, your missions will appear here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content">
      <BriefingMissionRow onOpenBriefing={onOpenBriefing} />
      {[0, 1, 2, 3].map(phase => {
        const phaseMissions = missions.filter(m => Number(m.phase) === phase)
        if (phaseMissions.length === 0) return null
        const cp = Number(currentPhase)
        const isLocked = phase < cp

        const incomplete = m => !completedMissions.has(m.playerMissionId)
        const lockedIncomplete = phaseMissions.filter(m => isLocked && incomplete(m))
        const compactCompleted = phaseMissions.filter(m => completedMissions.has(m.playerMissionId))
        const fullCardMissions = phaseMissions.filter(m => incomplete(m) && !isLocked)
        const showCompactRow = lockedIncomplete.length > 0 || compactCompleted.length > 0

        return (
          <div key={phase} className="missions-phase">
            {fullCardMissions.length > 0 && (
              <div className="missions-grid">
                {fullCardMissions.map(mission => (
                  <div
                    key={mission.playerMissionId}
                    className="mission-card clickable"
                    onClick={() => onMissionClick(mission.playerMissionId)}
                  >
                    <div className="mission-header">
                      <h3>{mission.title}</h3>
                      {mission.bounty > 0 && (
                        <span style={{ fontSize: '0.75em', color: 'var(--green)', fontWeight: 'bold' }}>{`$${mission.bounty}`}</span>
                      )}
                    </div>
                    <p style={{ whiteSpace: 'pre-line' }}>{mission.missionBody}</p>
                  </div>
                ))}
              </div>
            )}

            {showCompactRow && (
              <div className="missions-grid missions-grid--compact">
                {compactCompleted.map(mission => (
                  <div
                    key={mission.playerMissionId}
                    className="mission-card mission-card--completed clickable"
                    onClick={() => onMissionClick(mission.playerMissionId)}
                  >
                    <div className="mission-card-completed-row">
                      <h3>{mission.title}</h3>
                      {mission.bounty > 0 && (
                        <span
                          className={
                            mission.bountyPaid
                              ? 'mission-bounty-badge mission-bounty-badge--paid'
                              : 'mission-bounty-badge mission-bounty-badge--unpaid'
                          }
                        >
                          {mission.bountyPaid ? 'PAID' : 'UNPAID'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {lockedIncomplete.map(mission => (
                  <div
                    key={mission.playerMissionId}
                    className="mission-card mission-card--unavailable"
                    aria-disabled="true"
                  >
                    <h3>{mission.title}</h3>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default MissionsTab
