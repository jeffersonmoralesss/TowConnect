import { useEffect, useRef, useState } from 'react'

// Accident check-in (FR-D5, LR-4, LR-9). Safety first, then the police-tow question.
// Calls onDone({ notice }) when the driver may look for a tow.
//
// This is a small state machine: `step` is the current screen, each answer moves to another step
// or finishes, and `history` is a stack of past steps so Back always returns to the previous question.
// All questions live in one `screens` object, so the whole flow can be read (and changed) in one place.
export default function CheckIn({ onDone }) {
  const [step, setStep] = useState('hurt')
  const [history, setHistory] = useState([])
  const headingRef = useRef(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const go = (next) => {
    setHistory((h) => [...h, step])
    setStep(next)
  }
  const back = () => {
    const prev = history.at(-1)
    if (!prev) return
    setStep(prev)
    setHistory(history.slice(0, -1))
  }

  const screens = {
    hurt: {
      title: 'Is anyone hurt?',
      body: 'Including you, your passengers, or anyone else involved.',
      actions: [
        { label: 'Yes, someone is hurt', tone: 'danger', onClick: () => go('emergency') },
        { label: 'No one is hurt', onClick: () => go('what') },
      ],
    },
    emergency: {
      title: 'Call 911 first',
      body: 'Get medical help before anything else. If you can, move away from traffic while you wait.',
      actions: [
        { label: 'Call 911', tone: 'danger', href: 'tel:911' },
        { label: 'Everyone has help. Find a tow', onClick: () => go('what') },
      ],
    },
    what: {
      title: 'What happened?',
      actions: [
        {
          label: 'My car broke down',
          onClick: () => onDone({ notice: 'Turn on your hazard lights and wait off the road if it is safe to do so.' }),
        },
        { label: 'I was in an accident', onClick: () => go('police') },
      ],
    },
    police: {
      title: 'Are police at the scene?',
      actions: [
        { label: 'Yes, police are here', onClick: () => go('policeTow') },
        {
          label: 'No, or not yet',
          onClick: () => onDone({ notice: 'If police arrive, tell the officer you have called your own tow truck.' }),
        },
      ],
    },
    policeTow: {
      title: 'Has the officer already called a tow truck?',
      body: 'Officers sometimes call a tow from a city list, especially when a car is blocking traffic.',
      actions: [
        { label: 'Yes, the officer called one', onClick: () => go('wait') },
        {
          label: 'No',
          onClick: () => onDone({ notice: 'Tell the officer you are calling your own tow truck and which company is coming.' }),
        },
        { label: "I'm not sure", onClick: () => go('ask') },
      ],
    },
    wait: {
      title: 'Wait for the tow the officer called',
      body:
        'When police have already called a tow, sending a second truck can conflict with it and may not be allowed. ' +
        'If you would rather use your own tow, ask the officer first.',
      actions: [
        {
          label: 'The officer said I can call my own',
          onClick: () => onDone({ notice: 'Tell the officer which company is coming before the truck arrives.' }),
        },
      ],
    },
    ask: {
      title: 'Ask the officer before you call',
      body: 'Ask whether a tow is already on the way. If one is not, you can choose your own.',
      actions: [
        {
          label: 'No tow was called. Find a tow',
          onClick: () => onDone({ notice: 'Tell the officer you are calling your own tow truck and which company is coming.' }),
        },
        { label: 'One is on the way. I will wait', onClick: () => go('wait') },
      ],
    },
  }

  const screen = screens[step]

  return (
    <main className="checkin">
      <div className="checkin-inner">
        {history.length > 0 && (
          <button type="button" className="link-button back" onClick={back}>
            Back
          </button>
        )}
        <h1 className="question" tabIndex={-1} ref={headingRef}>
          {screen.title}
        </h1>
        {screen.body && <p className="question-body">{screen.body}</p>}
        <div className="answers">
          {screen.actions.map((action) =>
            action.href ? (
              <a key={action.label} className={`answer ${action.tone ?? ''}`} href={action.href}>
                {action.label}
              </a>
            ) : (
              <button key={action.label} type="button" className={`answer ${action.tone ?? ''}`} onClick={action.onClick}>
                {action.label}
              </button>
            ),
          )}
        </div>
      </div>
    </main>
  )
}
