import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { videoApi, escrowApi, aiApi } from '../api'

export function LiveRoomPage() {
  const { id } = useParams<{ id: string }>()
  const [room, setRoom] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isDepositing, setIsDepositing] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (id) {
      loadRoom(id)
    }
  }, [id])

  const loadRoom = async (dealId: string) => {
    try {
      const roomInfo = await videoApi.createRoom(dealId)
      setRoom(roomInfo)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeposit = async () => {
    if (!id) return
    setIsDepositing(true)
    try {
      // Mock Solana transaction
      const mockTxSig = 'mock-sig-' + Math.random().toString(36).substring(7)
      await escrowApi.deposit(id, 10.0, 'USDC-MINT-ADDRESS', mockTxSig)
      alert('Escrow deposited successfully!')
    } catch (err: any) {
      alert('Deposit failed: ' + err.message)
    } finally {
      setIsDepositing(false)
    }
  }

  const handleFinish = async () => {
    if (!id) return
    setIsFinishing(true)
    try {
      // Capture screenshot for AI analysis
      if (videoRef.current && canvasRef.current) {
        const context = canvasRef.current.getContext('2d')
        if (context) {
          context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
          const screenshotUrl = canvasRef.current.toDataURL('image/png')
          // Send to AI for check
          await aiApi.analyze(id, screenshotUrl)
        }
      }
      
      alert('Session finished! Awaiting buyer confirmation or AI milestone check.')
      navigate('/dashboard')
    } catch (err: any) {
      alert('Finish failed: ' + err.message)
    } finally {
      setIsFinishing(false)
    }
  }

  const toggleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing)
    // In production, this would use LiveKit SDK to start screen sharing
  }

  if (loading) return <div className="p-8 text-center">Loading live room...</div>

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 p-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center space-x-4">
          <h1 className="text-lg font-bold">Live Deal Session</h1>
          <span className="text-sm text-gray-400 font-mono">{id}</span>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleDeposit}
            disabled={isDepositing}
            className="px-4 py-1 bg-green-600 rounded text-sm hover:bg-green-700 disabled:opacity-50"
          >
            Deposit Escrow
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-1 bg-gray-700 rounded text-sm hover:bg-gray-600"
          >
            Exit
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 grid grid-cols-4 gap-4 overflow-hidden">
        <div className="col-span-3 bg-black rounded-lg relative overflow-hidden flex items-center justify-center">
          {/* Main View: Screen Share or Video */}
          {isScreenSharing ? (
            <div className="text-center">
              <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-xl">Screen Sharing Active</p>
              <p className="text-gray-400">Sensitive fields are being blurred client-side</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              className="w-full h-full object-cover"
              poster="https://via.placeholder.com/1280x720/000000/FFFFFF?text=Waiting+for+Seller+Camera"
            />
          )}
          
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4">
            <button
              onClick={toggleScreenShare}
              className={`p-3 rounded-full ${isScreenSharing ? 'bg-red-600' : 'bg-gray-700'} hover:opacity-80`}
              title={isScreenSharing ? "Stop Screen Share" : "Start Screen Share"}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button className="p-3 bg-gray-700 rounded-full hover:opacity-80">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="col-span-1 flex flex-col space-y-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-4 flex-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 border-b border-gray-700 pb-2">Session Info</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <p className="text-sm">Active Monitoring</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Milestone Detection</p>
                <span className="text-xs bg-yellow-900 text-yellow-200 px-2 py-0.5 rounded">In Progress</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <button
              onClick={handleFinish}
              disabled={isFinishing}
              className="w-full py-2 bg-blue-600 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              Finish Work
            </button>
            <p className="mt-2 text-xs text-center text-gray-500">
              Captures proof and notifies buyer
            </p>
          </div>
        </div>
      </main>

      {/* Hidden canvas for screenshots */}
      <canvas ref={canvasRef} width="1280" height="720" className="hidden" />
    </div>
  )
}