import React, { Component } from 'react';
import Animated from 'react-native-reanimated';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

const {
  add,
  cond,
  debug,
  diff,
  divide,
  eq,
  event,
  exp,
  lessThan,
  and,
  multiply,
  pow,
  set,
  greaterOrEq,
  lessOrEq,
  sqrt,
  startClock,
  stopClock,
  sub,
  Clock,
  Value,
} = Animated;

const REST_SPEED_THRESHOLD = 0.001;
const DEFAULT_SNAP_TENSION = 300;
const DEFAULT_SNAP_DAMPING = 0.7;
const DEFAULT_GRAVITY_STRENGTH = 400;
const DEFAULT_GRAVITY_FALLOF = 40;

function sq(x) {
  return multiply(x, x);
}

function influenceAreaWithRadius(radius, anchor) {
  return {
    left: (anchor.x || 0) - radius,
    right: (anchor.x || 0) + radius,
    top: (anchor.y || 0) - radius,
    bottom: (anchor.y || 0) + radius,
  };
}

function snapTo(target, snapPoints, best) {
  const dist = new Value(0);
  const snap = pt => [
    set(best.tension, pt.tension || DEFAULT_SNAP_TENSION),
    set(best.damping, pt.damping || DEFAULT_SNAP_DAMPING),
    set(best.x, pt.x || 0),
    set(best.y, pt.y || 0),
  ];
  const snapDist = pt =>
    add(sq(sub(target.x, pt.x || 0)), sq(sub(target.y, pt.y || 0)));
  return [
    set(dist, snapDist(snapPoints[0])),
    ...snap(snapPoints[0]),
    ...snapPoints.map(pt => {
      const newDist = snapDist(pt);
      return cond(lessThan(newDist, dist), [set(dist, newDist), ...snap(pt)]);
    }),
  ];
}

function springBehavior(dt, target, obj, anchor, tension = 300) {
  const dx = sub(target.x, anchor.x);
  const ax = divide(multiply(-1, tension, dx), obj.mass);
  const dy = sub(target.y, anchor.y);
  const ay = divide(multiply(-1, tension, dy), obj.mass);
  return {
    x: set(obj.vx, add(obj.vx, multiply(dt, ax))),
    y: set(obj.vy, add(obj.vy, multiply(dt, ay))),
  };
}

function frictionBehavior(dt, target, obj, damping = 0.7) {
  const friction = pow(damping, multiply(60, dt));
  return {
    x: set(obj.vx, multiply(obj.vx, friction)),
    y: set(obj.vy, multiply(obj.vy, friction)),
  };
}

function anchorBehavior(dt, target, obj, anchor) {
  const dx = sub(anchor.x, target.x);
  const dy = sub(anchor.y, target.y);
  return {
    x: set(obj.vx, divide(dx, dt)),
    y: set(obj.vy, divide(dy, dt)),
  };
}

function gravityBehavior(
  dt,
  target,
  obj,
  anchor,
  strength = DEFAULT_GRAVITY_STRENGTH,
  falloff = DEFAULT_GRAVITY_FALLOF
) {
  const dx = sub(target.x, anchor.x);
  const dy = sub(target.y, anchor.y);
  const drsq = add(sq(dx), sq(dy));
  const dr = sqrt(drsq);
  const a = divide(
    multiply(-1, strength, dr, exp(divide(multiply(-0.5, drsq), sq(falloff)))),
    obj.mass
  );
  const div = divide(a, dr);
  return {
    x: cond(dr, set(obj.vx, add(obj.vx, multiply(dt, dx, div)))),
    y: cond(dr, set(obj.vy, add(obj.vy, multiply(dt, dy, div)))),
  };
}

function withInfluence(area, target, behavior) {
  if (!area) {
    return behavior;
  }
  const testLeft = area.left === undefined || lessOrEq(area.left, target.x);
  const testRight = area.right === undefined || lessOrEq(target.x, area.right);
  const testTop = area.top === undefined || lessOrEq(area.top, target.y);
  const testBottom =
    area.bottom === undefined || lessOrEq(target.y, area.bottom);
  const testNodes = [testLeft, testRight, testTop, testBottom].filter(
    t => t !== true
  );
  const test = and(...testNodes);
  return {
    x: cond(test, behavior.x),
    y: cond(test, behavior.y),
  };
}

class Interactable extends Component {
  static defaultProps = {
    dragToss: 0.1,
    dragEnabled: true,
  };

  constructor(props) {
    super(props);

    const gesture = { x: new Value(0), y: new Value(0) };
    const state = new Value(-1);

    this._onGestureEvent = event([
      {
        nativeEvent: {
          translationX: gesture.x,
          translationY: gesture.y,
          // velocityX: dragVX,
          state: state,
        },
      },
    ]);

    const target = { x: new Value(0), y: new Value(0) };

    const clock = new Clock();

    // const tossedX = transX; //add(transX, multiply(props.dragToss, dragVX));

    const dt = divide(diff(clock), 1000);

    const obj = {
      vx: new Value(0),
      vy: new Value(0),
      mass: 1,
    };

    const permBuckets = [[], [], []];

    const addSpring = (anchor, tension, influence, buckets = permBuckets) => {
      buckets[0].push(
        withInfluence(
          influence,
          target,
          springBehavior(dt, target, obj, anchor, tension)
        )
      );
    };

    const addFriction = (damping, influence, buckets = permBuckets) => {
      buckets[1].push(
        withInfluence(
          influence,
          target,
          frictionBehavior(dt, target, obj, damping)
        )
      );
    };

    const addGravity = (
      anchor,
      strength,
      falloff,
      influence,
      buckets = permBuckets
    ) => {
      buckets[0].push(
        withInfluence(
          influence,
          target,
          gravityBehavior(dt, target, obj, anchor, strength, falloff)
        )
      );
    };

    const dragAnchor = { x: new Value(0), y: new Value(0) };
    const dragBuckets = [[], [], []];
    if (props.dragWithSpring) {
      const { tension, damping } = props.dragWithSpring;
      addSpring(dragAnchor, tension, null, dragBuckets);
      addFriction(damping, null, dragBuckets);
    } else {
      dragBuckets[0].push(anchorBehavior(dt, target, obj, dragAnchor));
    }

    if (props.springPoints) {
      props.springPoints.forEach(pt => {
        addSpring(pt, pt.tension, pt.influenceArea);
        if (pt.damping) {
          addFriction(pt.damping, pt.influenceArea);
        }
      });
    }
    if (props.gravityPoints) {
      props.gravityPoints.forEach(pt => {
        const falloff = pt.falloff || DEFAULT_GRAVITY_FALLOF;
        addGravity(pt, pt.strength, falloff, pt.influenceArea);
        if (pt.damping) {
          const influenceArea =
            pt.influenceArea || influenceAreaWithRadius(1.4 * falloff, pt);
          addFriction(pt.damping, influenceArea);
        }
      });
    }
    if (props.frictionAreas) {
      props.frictionAreas.forEach(pt => {
        addFriction(pt.damping, pt.influenceArea);
      });
    }

    const snapBuckets = [[], [], []];
    const snapAnchor = {
      x: new Value(0),
      y: new Value(0),
      tension: new Value(DEFAULT_SNAP_TENSION),
      damping: new Value(DEFAULT_SNAP_DAMPING),
    };
    const updateSnapTo = snapTo(target, props.snapPoints, snapAnchor);

    addSpring(snapAnchor, snapAnchor.tension, null, snapBuckets);
    addFriction(snapAnchor.damping, null, snapBuckets);

    // behaviors can go under one of three buckets depending on their priority
    // we append to each bucket but in Interactable behaviors get added to the
    // front, so we join in reverse order and then reverse the array.
    const sortBuckets = specialBuckets => ({
      x: specialBuckets
        .map((b, idx) => [...permBuckets[idx], ...b].reverse().map(b => b.x))
        .reduce((acc, b) => acc.concat(b), []),
      y: specialBuckets
        .map((b, idx) => [...permBuckets[idx], ...b].reverse().map(b => b.y))
        .reduce((acc, b) => acc.concat(b), []),
    });
    const dragBehaviors = sortBuckets(dragBuckets);
    const snapBehaviors = sortBuckets(snapBuckets);

    const stopWhenNeeded = cond(
      lessThan(
        add(sq(obj.vx), sq(obj.vy)),
        REST_SPEED_THRESHOLD * REST_SPEED_THRESHOLD
      ),
      stopClock(clock),
      startClock(clock)
    );

    const trans = (axis, vaxis) => {
      const dragging = new Value(0);
      const start = new Value(0);
      const x = target[axis];
      const vx = obj[vaxis];
      const anchor = dragAnchor[axis];
      const drag = gesture[axis];
      const update = set(x, add(x, multiply(vx, dt)));
      return cond(
        eq(state, State.ACTIVE),
        [
          cond(dragging, 0, [
            startClock(clock),
            set(dragging, 1),
            set(start, x),
          ]),
          set(anchor, add(start, drag)),
          cond(dt, dragBehaviors[axis]),
          update,
        ],
        [
          cond(dragging, [updateSnapTo, set(dragging, 0)]),
          cond(dt, snapBehaviors[axis]),
          stopWhenNeeded,
          update,
        ]
      );
    };

    this._transX = trans('x', 'vx');
    this._transY = trans('y', 'vy');
  }
  render() {
    const { children, style, horizontalOnly, verticalOnly } = this.props;
    return (
      <PanGestureHandler
        maxPointers={1}
        enabled={this.props.dragEnabled}
        onGestureEvent={this._onGestureEvent}
        onHandlerStateChange={this._onGestureEvent}>
        <Animated.View
          style={[
            style,
            {
              transform: [
                {
                  translateX: !verticalOnly && this._transX,
                  translateY: !horizontalOnly && this._transY,
                },
              ],
            },
          ]}>
          {children}
        </Animated.View>
      </PanGestureHandler>
    );
  }
}

export default {
  View: Interactable,
};
