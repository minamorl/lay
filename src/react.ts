// @minamorl/lay React integration
import { useState, useEffect } from "react";
import type { Focus, Comparator } from "./index";

export const useFocus = <S>(focus: Focus<S>, comparator?: Comparator<S>): S => {
  const [value, setValue] = useState(() => focus.get());

  useEffect(() => {
    const unsubscribe = focus.reflect((newValue) => {
      setValue(newValue);
    }, comparator);

    return unsubscribe;
  }, [focus, comparator]);

  return value;
};
