import React, { Component } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import Animated, { Easing } from 'react-native-reanimated';

const {
  set,
  cond,
  eq,
  add,
  call,
  multiply,
  lessThan,
  startClock,
  stopClock,
  clockRunning,
  block,
  timing,
  debug,
  ReusableNode,
  spring,
  Value,
  Clock,
  event,
  ProceduralNode,
} = Animated;

function runTiming(clock, value, dest) {
  const state = {
    finished: new Value(0),
    position: new Value(0),
    time: new Value(0),
    frameTime: new Value(0),
  };

  const config = {
    duration: 5000,
    toValue: new Value(0),
    easing: Easing.inOut(Easing.ease),
  };

  return block([
    cond(clockRunning(clock), 0, [
      set(state.finished, 0),
      set(state.time, 0),
      set(state.position, value),
      set(state.frameTime, 0),
      set(config.toValue, dest),
      startClock(clock),
    ]),
    timing(clock, state, config),
    cond(state.finished, debug('stop clock', stopClock(clock))),
    state.position,
  ]);
}

export default class Example extends Component {
  constructor(props) {
    super(props);
    this.proc = new ProceduralNode(x => multiply(x, -1));

    const transX = new Value(0);

    this._transX = runTiming(new Clock(), transX, 120);

    const transX2 = new Value(0);

    this._transX2 = runTiming(new Clock(), transX2, -120);

    // const twenty = new Value(20);
    // const thirty = new Value(30);
    // this._transX = cond(new Value(0), twenty, multiply(3, thirty));
  }
  render() {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Animated.View
          style={[
            styles.box,
            {
              transform: [{ translateX: this.proc.invoke(this._transX) }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.box,
            {
              transform: [{ translateX: this.proc.invoke(this._transX2) }],
            },
          ]}
        />
      </ScrollView>
    );
  }
}

const BOX_SIZE = 100;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderColor: '#F5FCFF',
    alignSelf: 'center',
    backgroundColor: 'plum',
    margin: BOX_SIZE / 2,
  },
});
