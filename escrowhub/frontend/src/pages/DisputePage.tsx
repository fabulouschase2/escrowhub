import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { disputesApi, aiApi } from '../api'

export function DisputePage() {
  const { dealId } = useParams<{ dealId: string }>()
  const [disputes, setDisputes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newDispute, setNewDispute] = useState({ reason: '', evidenceUrls: '' })
  const [aiChecks, setAiChecks] = useState<any[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (dealId) {
      loadDisputes(dealId)
    }
  }, [dealId])

  const loadDisputes = async (dealId: string) => {
    try {
      const data = await disputesApi.get(dealId)
      setDisputes(data)
      // Load AI checks for this deal's session
      // In reality, we'd get the session ID from the deal
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDispute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dealId) return
    
    try {
      await disputesApi.create(
        dealId,
        'current-user-id', // In reality, get from auth context
        newDispute.reason,
        newDispute.evidenceUrls.split(',').map(s => s.trim()).filter(Boolean)
      )
      setShowCreate(false)
      setNewDispute({ reason: '', evidenceUrls: '' })
      loadDisputes(dealId)
    } catch (err: any) {
      alert('Failed to create dispute: ' + err.message)
    }
  }

  const handleResolve = async (disputeId: string, resolution: string) => {
    try {
      await disputesApi.resolve(disputeId, resolution)
      loadDisputes(dealId!)
    } catch (err: any) {
      alert('Failed to resolve: ' + err.message)
    }
  }

  if (loading) return <div className="p-8 text-center">Loading disputes...</div>

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">Disputes for Deal {dealId?.slice(0, 8)}...</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Disputes</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {showCreate ? 'Cancel' : 'Create Dispute'}
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <form onSubmit={handleCreateDispute} className="space-y-4 max-w-2xl">
              <h3 className="text-lg font-semibold">Create New Dispute</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  value={newDispute.reason}
                  onChange={(e) => setNewDispute({...newDispute, reason: e.target.value})}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Evidence URLs (comma-separated)</label>
                <input
                  type="text"
                  value={newDispute.evidenceUrls}
                  onChange={(e) => setNewDispute({...newDispute, evidenceUrls: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/evidence1.png, https://example.com/evidence2.png"
                />
              </div>
              <div className="flex space-x-4">
                <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                  Submit Dispute
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {disputes.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <p className="text-gray-500 mb-4">No disputes for this deal</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create First Dispute
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {disputes.map((dispute) => (
              <div key={dispute.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex justify-between items-start">
                  <div>
                    <p className="text-sm font-mono text-gray-500">ID: {dispute.id}</p>
                    <p className="text-sm text-gray-500">Initiator: {dispute.initiator_id.slice(0, 8)}...</p>
                  </div>
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                    dispute.resolution === 'released' ? 'bg-green-100 text-green-800' :
                    dispute.resolution === 'refunded' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {dispute.resolution || 'Pending'}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-gray-800 mb-3">{dispute.reason}</p>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Created: {new Date(dispute.created_at).toLocaleString()}</span>
                    {dispute.resolution && (
                      <span>Resolved: {new Date(dispute.resolved_at!).toLocaleString()}</span>
                    )}
                  </div>
                  {dispute.evidence_urls && dispute.evidence_urls.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700 mb-1">Evidence:</p>
                      <div className="space-x-2">
                        {dispute.evidence_urls.map((url: string, idx: number) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                            Evidence {idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {!dispute.resolution && (
                  <div className="p-4 border-t border-gray-200 bg-gray-50 flex space-x-4">
                    <button
                      onClick={() => handleResolve(dispute.id, 'released')}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Release Escrow
                    </button>
                    <button
                      onClick={() => handleResolve(dispute.id, 'refunded')}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Refund Escrow
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI Checks Section */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">AI Milestone Checks</h2>
          <div className="bg-white rounded-lg shadow-sm p-6">
            {aiLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading AI analysis...</p>
              </div>
            ) : aiChecks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No AI checks yet. Screenshots from live sessions will be analyzed here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {aiChecks.map((check) => (
                  <div key={check.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-mono text-gray-500">
                        {check.id.slice(0, 8)}... @ {new Date(check.created_at).toLocaleString()}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        check.analysis_result?.milestone_reached ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {check.analysis_result?.milestone_reached ? 'Milestone Reached' : 'Failed'}
                      </span>
                    </div>
                    <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-40">
                      {JSON.stringify(check.analysis_result, null, 2)}
                    </pre>
                    {check.screenshot_url && (
                      <a href={check.screenshot_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm hover:underline mt-2 inline-block">
                        View Screenshot
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}