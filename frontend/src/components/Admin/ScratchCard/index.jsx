import React, { useState, useEffect, useMemo } from "react";
import {
  Grid,
  makeStyles,
  Paper,
  TextField,
  Typography,
  useTheme,
  IconButton,
  Button,
} from "@material-ui/core";
import AddIcon from "@material-ui/icons/Add";
import RemoveIcon from "@material-ui/icons/Remove";
import useAxios from "axios-hooks";
import { DotsLoading } from "../../Loading";
import { DataGrid } from "@mui/x-data-grid";

const useStyles = makeStyles(theme => ({
  root: {
    "& > .MuiGrid-item": {
      marginTop: theme.spacing(2),
    },
  },
}));

const columns = [
  {
    field: "reward",
    headerName: "獎勵",
    editable: false,
  },
  {
    field: "count",
    headerName: "數量",
    editable: false,
  },
  {
    field: "rate",
    headerName: "中獎率",
    editable: false,
  },
];

const ScratchCard = () => {
  const [{ data = [], loading }] = useAxios("/api/ScratchCard");
  const [{ loading: generateLoading }, generate] = useAxios(
    {
      url: "/api/ScratchCard/generate",
      method: "POST",
    },
    { manual: true }
  );
  const [selected, setSelected] = useState({});
  const [options, setOptions] = useState([]);
  const [generateCount, setGenerateCount] = useState(1);
  const classes = useStyles();
  const theme = useTheme();

  useEffect(() => {
    if (!data) return;

    const [first] = data;
    if (!first) return;
    setSelected(first);
    setOptions([
      {
        reward: first.max_reward,
        count: 1,
      },
    ]);
  }, [data]);

  const OptionGrid = useMemo(() => {
    return options.map((option, index) => {
      const isLast = index === options.length - 1;
      const handleClick = () => {
        if (isLast) {
          handleAddOption();
        } else {
          handleRemoveOption(index);
        }
      };
      const handleChange = event => {
        const value = parseInt(event.target.value);

        if (isNaN(value)) return;
        if (value < 0) return;

        const newOptions = [...options];
        newOptions[index] = {
          ...newOptions[index],
          [event.target.name]: value,
        };
        setOptions(newOptions);
      };
      return (
        <Grid container item xs={12} alignItems="center" spacing={1} key={index}>
          <Grid item>
            <TextField
              fullWidth
              variant="outlined"
              label="獎勵"
              type="number"
              name="reward"
              value={option.reward}
              onChange={handleChange}
            />
          </Grid>
          <Grid item>
            <TextField
              fullWidth
              variant="outlined"
              label="數量"
              type="number"
              name="count"
              value={option.count}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={2}>
            <IconButton onClick={handleClick}>{isLast ? <AddIcon /> : <RemoveIcon />}</IconButton>
          </Grid>
        </Grid>
      );
    });
  }, [options]);

  const pageLoading = loading || generateLoading;
  if (pageLoading) {
    return <DotsLoading />;
  }

  const totalReward = options.reduce((acc, option) => acc + option.reward * option.count, 0);
  const totalCount = options.reduce((acc, option) => acc + option.count, 0);
  const noneRewardOption = {
    reward: 0,
    count: generateCount - totalCount,
  };

  const handleChange = event => {
    const value = parseInt(event.target.value);
    const target = data.find(option => option.id === value);
    setSelected(target);
  };

  const handleAddOption = () => {
    const lastReward = options[options.length - 1].reward;
    setOptions([
      ...options,
      {
        reward: lastReward / 2,
        count: 1,
      },
    ]);
  };

  const handleRemoveOption = index => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const submitOptions = options.concat(noneRewardOption);
    generate({
      data: {
        id: selected.id,
        data: submitOptions,
      },
    });
  };

  if (!selected) {
    return <DotsLoading />;
  }

  if (generateCount < totalCount) {
    setGenerateCount(totalCount);
  }

  const rows = options.concat(noneRewardOption).map((option, index) => ({
    id: index,
    rate: Math.round((option.count / generateCount) * 10000) / 100 + "%",
    ...option,
  }));

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12}>
        <Typography variant="h4">庫存生成</Typography>
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          variant="outlined"
          select
          SelectProps={{ native: true }}
          onChange={handleChange}
          defaultValue={selected.id}
        >
          {data.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </TextField>
      </Grid>
      <Grid item xs={12} component={Paper} style={{ padding: theme.spacing(2) }} direction="column">
        <Grid item>
          <Typography variant="h6">小計</Typography>
        </Grid>
        <Grid item>
          <Typography variant="body1">單張售價：{selected.price}</Typography>
        </Grid>
        <Grid item>
          <Typography variant="body1">數量：{generateCount}</Typography>
        </Grid>
        <Grid item>
          <Typography variant="body1">總價：{selected.price * generateCount}</Typography>
        </Grid>
        <Grid item>
          <Typography variant="body1">總獎勵：{totalReward}</Typography>
        </Grid>
        <Grid item>
          <Typography variant="body1">
            利潤：{selected.price * generateCount - totalReward}
          </Typography>
        </Grid>
      </Grid>
      <Grid item component={"div"} style={{ height: 400, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          hideFooter
          hideFooterPagination
          hideFooterSelectedRowCount
          disableColumnFilter
          disableColumnMenu
          disableColumnSelector
          disableDensitySelector
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          variant="outlined"
          fullWidth
          label="數量"
          type="number"
          defaultValue={1}
          value={generateCount}
          onChange={e => setGenerateCount(e.target.value)}
        />
      </Grid>
      {OptionGrid}
      <Grid item xs={12}>
        <Button
          variant="contained"
          fullWidth
          color="primary"
          onClick={handleSubmit}
          disabled={generateLoading}
        >
          產生
        </Button>
      </Grid>
    </Grid>
  );
};

export default ScratchCard;
