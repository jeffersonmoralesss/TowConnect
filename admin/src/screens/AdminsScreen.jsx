// Who the admins are, adding and removing them, and the activity log (who did what, when).
import { useCallback, useEffect, useState } from 'react'
import { Banner, Body, Button, Card, Field, Heading } from '../components/ui'
import { addAdmin, currentUserId, listActivity, listAdmins, removeAdmin } from '../lib/api'

const when = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function AdminsScreen() {
  const [admins, setAdmins] = useState(null)
  const [activity, setActivity] = useState(null)
  const [me, setMe] = useState(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [a, log, id] = await Promise.all([listAdmins(), listActivity(), currentUserId()])
      setAdmins(a)
      setActivity(log)
      setMe(id)
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (fn) => {
    setBusy(true)
    setMessage(null)
    try {
      const r = await fn()
      setMessage({ tone: r.ok ? 'good' : 'bad', text: r.message })
      if (r.ok) {
        setEmail('')
        load()
      }
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Card>
        <h2 className="card-title">Admins</h2>
        <Body muted>Admins can see every operator's documents, so only add people you trust completely.</Body>
        <ul className="plain-list">
          {admins?.map((a) => (
            <li key={a.user_id}>
              <span>
                {a.email}
                {a.user_id === me ? <span className="muted"> (you)</span> : null}
              </span>
              {a.user_id !== me ? (
                <Button
                  tone="link"
                  label="Remove"
                  disabled={busy}
                  onClick={() => confirm(`Remove ${a.email} as an admin?`) && run(() => removeAdmin(a.user_id))}
                />
              ) : null}
            </li>
          ))}
        </ul>
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (email.trim()) run(() => addAdmin(email))
          }}
        >
          <Field
            label="Add an admin by email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="They need a Tow Connect account first. Signing up in the operator app is fine; that doesn't make them an operator until they fill in a company."
            autoCapitalize="none"
          />
          <Button type="submit" tone="secondary" label="Add admin" busy={busy} />
        </form>
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      </Card>

      <Heading>Activity</Heading>
      <Body muted>The last 100 changes. The database writes this list itself, so nobody can edit or erase it.</Body>
      {activity === null ? <p className="muted">Loading…</p> : null}
      {activity?.length === 0 ? <Body muted>Nothing yet.</Body> : null}
      {activity?.length ? (
        <div className="table-wrap">
          <table className="log">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((x) => (
                <tr key={x.id}>
                  <td>{when(x.created_at)}</td>
                  <td>{x.admin_email ?? <span className="muted">SQL Editor</span>}</td>
                  <td>
                    <strong>{x.action}</strong> {x.target_type} {x.target_name ? `· ${x.target_name}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
