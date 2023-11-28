import React, {useState} from 'react';
import {View} from 'react-native';
import useWindowDimensions from '@hooks/useWindowDimensions';
import ControlSelection from '@libs/ControlSelection';
import useThemeStyles from '@styles/useThemeStyles';
import Button from './Button';
import withLocalize from './withLocalize';

type BigNumberPadProps = {
    /** Callback to inform parent modal with key pressed */
    numberPressed: (key: string) => void;

    /** Callback to inform parent modal whether user is long pressing the "<" (backspace) button */
    longPressHandlerStateChanged?: (isUserLongPressingBackspace: boolean) => void;

    /** Used to locate this view from native classes. */
    id?: string;

    // TODO: Add withLocalize props (withLocalizePropTypes)
};

// const defaultProps = {
//     longPressHandlerStateChanged: () => {},
//     id: 'numPadView',
// };

const padNumbers = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', '<'],
];

function BigNumberPad(props) {
    const styles = useThemeStyles();
    const [timer, setTimer] = useState(null);
    const {isExtraSmallScreenHeight} = useWindowDimensions();

    /**
     * Handle long press key on number pad.
     * Only handles the '<' key and starts the continuous input timer.
     */
    const handleLongPress = (key: string) => {
        if (key !== '<') {
            return;
        }

        longPressHandlerStateChanged(true);

        const newTimer = setInterval(() => {
            numberPressed(key);
        }, 100);

        setTimer(newTimer);
    };

    return (
        <View
            style={[styles.flexColumn, styles.w100]}
            id={props.id}
        >
            {padNumbers.map((row, rowIndex) => (
                <View
                    // eslint-disable-next-line react/no-array-index-key
                    key={`NumberPadRow-${rowIndex}`}
                    style={[styles.flexRow, styles.mt3]}
                >
                    {row.map((column, columnIndex) => {
                        // Adding margin between buttons except first column to
                        // avoid unccessary space before the first column.
                        const marginLeft = columnIndex > 0 ? styles.ml3 : {};

                        return (
                            <Button
                                key={column}
                                medium={isExtraSmallScreenHeight}
                                shouldEnableHapticFeedback
                                style={[styles.flex1, marginLeft]}
                                text={column === '<' ? column : toLocaleDigit(column)}
                                onLongPress={() => handleLongPress(column)}
                                onPress={() => numberPressed(column)}
                                onPressIn={ControlSelection.block}
                                onPressOut={() => {
                                    if (timer) {
                                        clearInterval(timer);
                                    }

                                    ControlSelection.unblock();
                                    longPressHandlerStateChanged(false);
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                            />
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

BigNumberPad.displayName = 'BigNumberPad';

export default withLocalize(BigNumberPad);
