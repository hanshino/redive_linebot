import React, { useState, useEffect } from "react";
import MaterialTable from "material-table";
import PropTypes from "prop-types";
import CheckIcon from "@material-ui/icons/Check";
import CloseIcon from "@material-ui/icons/Close";
import Avatar from "@material-ui/core/Avatar";
import TableLocaliztion from "../../config/TableLocaliztion";
import { useParams } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Grid from "@material-ui/core/Grid";
import Pagination from "@material-ui/lab/Pagination";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import GroupAPI from "../../api/Group";
import Skeleton from "@material-ui/lab/Skeleton";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(2),
    "& > *": {
      marginTop: theme.spacing(1),
      marginBottom: theme.spacing(1),
    },
  },
}));

function genMemberAvatar(url, displayName) {
  return <Avatar src={url} alt={displayName} />;
}

const TableList = props => {
  const { signDatas, month } = props;

  const columns = [
    {
      title: "成員頭像",
      field: "pictureUrl",
      render: rowData => genMemberAvatar(rowData.pictureUrl, rowData.displayName),
    },
    { title: "成員姓名", field: "displayName" },
  ];

  let result = initialDatas(signDatas);

  const { dates, signDatas: displayDatas } = result;

  dates
    .filter(date => date > 23)
    .forEach(date => {
      columns.push({
        title: `${month}/${date}`,
        field: `${date}`,
        lookup: { Y: <CheckIcon color="primary" />, N: <CloseIcon color="error" /> },
      });
    });

  const SignTable = () => (
    <MaterialTable
      data={displayDatas}
      columns={columns}
      title="三刀簽到表"
      localization={TableLocaliztion}
      options={{
        pageSize: 30,
        pageSizeOptions: [10, 20, 30],
        headerStyle: { whiteSpace: "nowrap" },
      }}
    />
  );

  return <SignTable />;
};

/**
 * 整理簽到資料
 * @param {Array<{guildId: String, userId: String, signDates: Array<Number>, displayName: String}>} signDatas
 */
function initialDatas(signDatas) {
  let dates = [];
  signDatas.forEach(data => (dates = [...dates, ...data.signDates]));
  dates = [...new Set(dates)].sort();
  let result = [];

  signDatas.forEach(userData => {
    let temp = { ...userData };

    dates.forEach(date => {
      temp[date] = userData.signDates.includes(date) ? "Y" : "N";
    });

    result.push(temp);
  });

  return { dates, signDatas: result };
}

TableList.propTypes = {
  signDatas: PropTypes.array.isRequired,
  month: PropTypes.number.isRequired,
};

const SigninTable = () => {
  const classes = useStyles();
  const { groupId } = useParams();
  const [signDatas, setSignDatas] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    let result = await GroupAPI.getSignList(groupId, month);
    setSignDatas(result);
    setLoading(false);
  };

  useEffect(() => {
    window.document.title = "三刀簽到表";
  }, []);

  useEffect(() => {
    fetchData();
  }, [month, groupId]);

  return (
    <Grid container className={classes.root}>
      <Grid item xs={12} sm={12} component={Paper}>
        <Grid container className={classes.root} direction="column" alignItems="center">
          <Grid item xs={12} sm={12}>
            <Typography component="p" variant="h5">
              月份
            </Typography>
          </Grid>
          <Grid item xs={12} sm={12}>
            <Pagination
              count={12}
              page={month}
              variant="outlined"
              color="primary"
              boundaryCount={1}
              siblingCount={0}
              onChange={(event, page) => setMonth(page)}
            />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={12} sm={12}>
        {loading ? <Skeleton /> : <TableList signDatas={signDatas} month={month} />}
      </Grid>
    </Grid>
  );
};

export default SigninTable;
