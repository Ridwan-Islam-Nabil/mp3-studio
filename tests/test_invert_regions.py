"""
Tests for app._invert_regions — turns CUT regions (parts to delete) into KEEP regions.

The same cases are mirrored for the web app in mp3-studio-web/lib/ffmpeg.test.ts.
"""

import pytest


def cuts(*pairs):
    return [{"start": s, "end": e} for s, e in pairs]


def keeps(*pairs):
    return [{"start": s, "end": e} for s, e in pairs]


def test_no_cuts_keeps_full_file(invert_regions):
    assert invert_regions([], 60) == keeps((0, 60))


def test_single_cut_in_middle(invert_regions):
    assert invert_regions(cuts((10, 20)), 60) == keeps((0, 10), (20, 60))


def test_docstring_example(invert_regions):
    assert invert_regions(cuts((10, 20), (40, 50)), 60) == keeps((0, 10), (20, 40), (50, 60))


def test_unsorted_cuts_are_sorted(invert_regions):
    assert invert_regions(cuts((40, 50), (10, 20)), 60) == keeps((0, 10), (20, 40), (50, 60))


def test_overlapping_cuts_are_merged(invert_regions):
    assert invert_regions(cuts((10, 25), (20, 30)), 60) == keeps((0, 10), (30, 60))


def test_cut_contained_in_another_cut(invert_regions):
    # A short cut fully inside a longer one must not re-open a keep segment.
    assert invert_regions(cuts((10, 30), (15, 20)), 60) == keeps((0, 10), (30, 60))


def test_adjacent_cuts_touching(invert_regions):
    assert invert_regions(cuts((10, 20), (20, 30)), 60) == keeps((0, 10), (30, 60))


def test_cut_touching_start(invert_regions):
    assert invert_regions(cuts((0, 15)), 60) == keeps((15, 60))


def test_cut_touching_end(invert_regions):
    assert invert_regions(cuts((50, 60)), 60) == keeps((0, 50))


def test_cuts_touching_both_ends(invert_regions):
    assert invert_regions(cuts((0, 15), (590, 600)), 600) == keeps((15, 590))


def test_cut_covering_everything_keeps_nothing(invert_regions):
    assert invert_regions(cuts((0, 60)), 60) == []


def test_cut_extending_past_duration(invert_regions):
    assert invert_regions(cuts((50, 75)), 60) == keeps((0, 50))


def test_cut_starting_before_zero(invert_regions):
    assert invert_regions(cuts((-5, 10)), 60) == keeps((10, 60))


@pytest.mark.xfail(
    strict=True,
    reason="BUG: a cut that starts after the end of the audio produces a keep segment whose "
    "end is past `duration` (keep [0, 70] for a 60 s file). Harmless with FFmpeg in "
    "practice (-to past EOF just stops at EOF) and the UI keeps regions inside the audio.",
)
def test_cut_entirely_beyond_duration_is_ignored(invert_regions):
    assert invert_regions(cuts((70, 80)), 60) == keeps((0, 60))


def test_tiny_gap_between_cuts_is_dropped(invert_regions):
    # Keep-segments of 50 ms or less are ignored (MIN_GAP = 0.05).
    assert invert_regions(cuts((10, 20), (20.005, 30)), 60) == keeps((0, 10), (30, 60))


def test_small_gap_above_threshold_is_kept(invert_regions):
    assert invert_regions(cuts((10, 20), (20.1, 30)), 60) == keeps((0, 10), (20, 20.1), (30, 60))


def test_tiny_leading_and_trailing_gaps_are_dropped(invert_regions):
    assert invert_regions(cuts((0.005, 59.995)), 60) == []


def test_string_values_are_coerced(invert_regions):
    # JSON from the frontend may carry numbers as strings.
    assert invert_regions([{"start": "10", "end": "20"}], 60) == keeps((0, 10), (20, 60))


def test_values_are_rounded_to_4_decimals(invert_regions):
    assert invert_regions(cuts((1.123456789, 2)), 3) == keeps((0, 1.1235), (2, 3))


def test_input_is_not_mutated(invert_regions):
    data = cuts((40, 50), (10, 20))
    snapshot = [dict(r) for r in data]
    invert_regions(data, 60)
    assert data == snapshot
