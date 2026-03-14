export class AnimationInstance {
  startTime: number
  currentTime: number
  timeout: number
  initialPercent: number
  percent: number
  stopAnimation: boolean
  running: boolean
  duration: number
  frameFunction: (percent: number) => void

  constructor(duration: number, frameFunction: (percent: number) => void, initialPercent = 0) {
    this.startTime = Date.now()
    this.currentTime = this.startTime
    this.timeout = 0
    this.initialPercent = initialPercent
    this.percent = initialPercent
    this.stopAnimation = false
    this.running = true
    this.duration = duration
    this.frameFunction = frameFunction
    this.run()
  }

  run() {
    if (this.stopAnimation) {
      this.running = false
      if (this.timeout) {
        cancelAnimationFrame(this.timeout)
      }
    } else {
      this.currentTime = Date.now()
      if (!this.duration) {
        this.percent = 100
      } else {
        this.percent = this.initialPercent + this.easeInOutQuad(Math.min(1, Math.max(0, (this.currentTime - this.startTime) / this.duration))) * (100 - this.initialPercent)
      }
      this.frameFunction(this.percent)
      if (this.percent < 100) {
        this.timeout = requestAnimationFrame(() => this.run())
      } else {
        this.running = false
      }
    }
  }

  easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }

  destroy() {
    if (this.timeout) {
      cancelAnimationFrame(this.timeout)
    }
    this.running = false
  }
}

export function runAnimation(duration: number, frameFunction: (percent: number) => void, initialPercent = 0) {
  return new AnimationInstance(duration, frameFunction, initialPercent)
}
