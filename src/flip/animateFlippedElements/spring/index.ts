import { SpringSystem } from '../../../forked-rebound'
import { StaggerConfigValue } from '../../../Flipper/types'
import { FlipData, FlipDataArray } from '../types'
import { SpringSystemInterface } from '../../../forked-rebound/types'

// this should get created only 1x
const springSystem: SpringSystemInterface = new SpringSystem()

export const createSuspendedSpring = (flipData: FlipData) => {
  const {
    springConfig: { stiffness, damping, overshootClamping },
    noOp,
    onSpringActivate,
    getOnUpdateFunc,
    onAnimationEnd,
    isGestureControlled
  } = flipData

  if (noOp) {
    return null
  }
  const spring = springSystem.createSpring(stiffness!, damping!)
  spring.setOvershootClampingEnabled(!!overshootClamping)
  const onSpringAtRest = () => {
    // prevent SpringSystem from caching unused springs
    spring.destroy()
    onAnimationEnd()
  }

  spring.addListener({
    onSpringActivate,
    onSpringAtRest: !isGestureControlled ? onSpringAtRest : () => {},
    onSpringUpdate: getOnUpdateFunc({
      stop: spring.destroy.bind(spring),
      setEndValue: spring.setEndValue.bind(spring),
      setVelocity: spring.setVelocity.bind(spring),
      onAnimationEnd
    })
  })
  return spring
}

export const createSpring = (
  flipped: FlipData,
  isGestureControlled: boolean
) => {
  const spring = createSuspendedSpring({ ...flipped, isGestureControlled })
  if (isGestureControlled) {
    return flipped.onSpringActivate()
  }
  if (spring) {
    spring.setEndValue(1)
  } else {
    // even if it was a noop,
    // we still need to call onSpringActivate in case it calls
    // cascading flip initiation functions
    flipped.onSpringActivate()
  }
}

export const staggeredSprings = (
  flippedArray: FlipDataArray,
  staggerConfig: StaggerConfigValue = {},
  isGestureControlled: boolean
) => {
  if (!flippedArray || !flippedArray.length) {
    return
  }

  if (staggerConfig.reverse) {
    flippedArray.reverse()
  }

  const normalizedSpeed = staggerConfig.speed
    ? 1 + Math.max(Math.min(staggerConfig.speed, 0), 1)
    : 1.1

  const nextThreshold = 1 / Math.max(Math.min(flippedArray.length, 100), 10)

  let direction = 1

  const setDirection = (endValue: number) => {
    const currentDirection = endValue === 1 ? 1 : endValue === 0 ? 0 : undefined
    if (currentDirection !== undefined) {
      direction = currentDirection
    }
  }

  // default is 1
  setDirection(1)

  const setEndValueFuncs = flippedArray
    .filter(flipped => !flipped.noOp)
    .map((flipped, i) => {
      const cachedGetOnUpdate = flipped.getOnUpdateFunc

      // modify the update function to adjust
      // the end value of the trailing Flipped component
      flipped.getOnUpdateFunc = ({ setEndValue, ...rest }) => {
        if (isGestureControlled) {
          const wrappedSetEndValue = setEndValue => endValue => {
            setDirection(endValue)
            return setEndValue(endValue)
          }
          setEndValue = wrappedSetEndValue(setEndValue)
        }

        const onUpdate = cachedGetOnUpdate({ setEndValue, ...rest })
        return spring => {
          const currentValue = spring.getCurrentValue()
          const triggerTrailingAnimation =
            direction === 1
              ? currentValue > nextThreshold
              : nextThreshold > currentValue
          if (triggerTrailingAnimation) {
            if (setEndValueFuncs[i + 1]) {
              setEndValueFuncs[i + 1]!(
                Math.min(currentValue * normalizedSpeed, 1)
              )
            }
          }
          // now call the actual update function
          onUpdate(spring)
        }
      }
      return flipped
    })
    .map(flipped => {
      const spring = createSuspendedSpring({ ...flipped, isGestureControlled })
      if (!spring) {
        return
      }
      return spring.setEndValue.bind(spring)
    })
    .filter(Boolean)

  if (setEndValueFuncs[0] && !isGestureControlled) {
    setEndValueFuncs[0]!(1)
  }
}
